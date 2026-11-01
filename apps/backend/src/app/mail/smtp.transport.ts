import { hostname } from 'node:os';
import { connect, TLSSocket } from 'node:tls';

export interface SmtpOptions {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export interface SmtpMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

const TIMEOUT_MS = 30_000;

function base64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

function encodeHeader(value: string): string {
  return `=?UTF-8?B?${base64(value)}?=`;
}

function dotStuff(value: string): string {
  return value.replace(/^\./gm, '..');
}

function buildMessage(msg: SmtpMessage): string {
  const boundary = `----=_stats-hunter_${Date.now().toString(16)}`;
  const headers = [
    `From: ${msg.from}`,
    `To: ${msg.to}`,
    `Subject: ${encodeHeader(msg.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${process.pid}.stats-hunter@${hostname()}>`,
    '',
  ].join('\r\n');

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    msg.text,
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    msg.html,
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return `${headers}\r\n${body}`;
}

class SmtpConnection {
  private buffer = '';
  private lines: string[] = [];
  private waiters: Array<{
    resolve: (line: string) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(private readonly socket: TLSSocket) {
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => this.onData(chunk as string));
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf('\r\n');
    while (index >= 0) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 2);
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter.resolve(line);
      } else {
        this.lines.push(line);
      }
      index = this.buffer.indexOf('\r\n');
    }
  }

  readLine(): Promise<string> {
    if (this.lines.length > 0) {
      return Promise.resolve(this.lines.shift() as string);
    }
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  async readResponse(): Promise<{ code: number; message: string }> {
    let code = 0;
    let message = '';
    for (;;) {
      const line = await this.readLine();
      if (line.length < 3) {
        throw new Error(`Invalid SMTP response: "${line}"`);
      }
      const parsed = Number.parseInt(line.slice(0, 3), 10);
      if (Number.isNaN(parsed)) {
        throw new Error(`Invalid SMTP response code: "${line}"`);
      }
      code = parsed;
      message = line.slice(4);
      // A space (not a hyphen) after the code marks the final line.
      if (line[3] === ' ') {
        break;
      }
    }
    return { code, message };
  }

  write(line: string): void {
    this.socket.write(`${line}\r\n`);
  }

  end(): void {
    this.socket.end();
  }
}

async function openConnection(options: SmtpOptions): Promise<TLSSocket> {
  return new Promise<TLSSocket>((resolve, reject) => {
    const socket = connect(
      {
        host: options.host,
        port: options.port,
        servername: options.host,
        rejectUnauthorized: true,
      },
      () => resolve(socket),
    );
    socket.setTimeout(TIMEOUT_MS, () => {
      socket.destroy(new Error('SMTP connection timed out'));
    });
    socket.once('error', reject);
  });
}

function expectCode(response: { code: number; message: string }, expected: number): void {
  if (response.code !== expected) {
    throw new Error(`SMTP error ${response.code}: ${response.message}`);
  }
}

/**
 * Minimal SMTP client over implicit TLS (e.g. Yandex smtp.yandex.ru:465).
 * Uses AUTH LOGIN and multipart/alternative MIME. No external dependencies.
 */
export async function sendSmtpMail(
  options: SmtpOptions,
  message: SmtpMessage,
): Promise<void> {
  const socket = await openConnection(options);
  const connection = new SmtpConnection(socket);

  try {
    expectCode(await connection.readResponse(), 220);

    connection.write(`EHLO ${hostname()}`);
    expectCode(await connection.readResponse(), 250);

    connection.write('AUTH LOGIN');
    expectCode(await connection.readResponse(), 334);

    connection.write(base64(options.user));
    expectCode(await connection.readResponse(), 334);

    connection.write(base64(options.pass));
    expectCode(await connection.readResponse(), 235);

    connection.write(`MAIL FROM:<${options.user}>`);
    expectCode(await connection.readResponse(), 250);

    connection.write(`RCPT TO:<${message.to}>`);
    const rcpt = await connection.readResponse();
    if (rcpt.code !== 250 && rcpt.code !== 251) {
      throw new Error(`SMTP error ${rcpt.code}: ${rcpt.message}`);
    }

    connection.write('DATA');
    expectCode(await connection.readResponse(), 354);

    connection.write(dotStuff(buildMessage(message)));
    connection.write('.');
    expectCode(await connection.readResponse(), 250);

    connection.write('QUIT');
  } finally {
    connection.end();
  }
}
