import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthController } from './auth/auth.controller';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RateLimitGuard } from './auth/rate-limit.guard';
import { CredentialsModule } from './credentials/credentials.module';
import { MailModule } from './mail/mail.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CredentialsModule,
    MailModule,
    PrismaModule,
  ],
  controllers: [AppController, AuthController],
  providers: [
    AppService,
    RateLimitGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
