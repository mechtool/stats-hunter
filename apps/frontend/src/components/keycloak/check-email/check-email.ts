import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { KeycloakService } from '../../../app/keycloak/keycloak.service';
import { NotificationService } from '../../../app/services/notification.service';

const RESEND_COOLDOWN_SECONDS = 60;

@Component({
  selector: 'app-check-email',
  imports: [RouterModule, NzButtonModule, NzCardModule],
  templateUrl: './check-email.html',
  styleUrl: './check-email.scss',
})
export class CheckEmailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly keycloak = inject(KeycloakService);
  private readonly notification = inject(NotificationService);

  email = '';
  remainingSeconds = signal(RESEND_COOLDOWN_SECONDS);
  resending = false;

  private timer: ReturnType<typeof setInterval> | undefined;

  ngOnInit(): void {
    this.email =
      this.route.snapshot.queryParamMap.get('email')?.trim() ?? '';
    if (!this.email) {
      this.router.navigate(['/register']);
      return;
    }
    this.startCountdown();
  }

  ngOnDestroy(): void {
    this.stopCountdown();
  }

  canResend(): boolean {
    return this.remainingSeconds() <= 0 && !this.resending;
  }

  decline(): void {
    if (this.email) {
      void this.keycloak.cancelRegistration(this.email).catch(() => {
        // best-effort: navigation already happens; link expires on its own.
      });
    }
    this.router.navigate(['/register']);
  }

  async resend(): Promise<void> {
    if (!this.canResend() || !this.email) return;
    this.resending = true;
    try {
      await this.keycloak.resendVerification(this.email);
      this.notification.success(
        'Ссылка отправлена',
        'Новая ссылка для подтверждения отправлена на ваш email.',
      );
      this.remainingSeconds.set(RESEND_COOLDOWN_SECONDS);
      this.startCountdown();
    } catch {
      this.notification.error(
        'Ошибка',
        'Не удалось отправить ссылку. Попробуйте позже.',
      );
    } finally {
      this.resending = false;
    }
  }

  private startCountdown(): void {
    this.stopCountdown();
    this.timer = setInterval(() => {
      const next = this.remainingSeconds() - 1;
      if (next <= 0) {
        this.remainingSeconds.set(0);
        this.stopCountdown();
        return;
      }
      this.remainingSeconds.set(next);
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
