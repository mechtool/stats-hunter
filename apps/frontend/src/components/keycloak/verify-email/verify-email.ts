import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { KeycloakService } from '../../../app/keycloak/keycloak.service';
import { NotificationService } from '../../../app/services/notification.service';

@Component({
  selector: 'sh-verify-email',
  imports: [RouterModule, NzButtonModule, NzCardModule, NzIconModule],
  templateUrl: './verify-email.html',
  styleUrl: './verify-email.scss',
})
export class VerifyEmailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly keycloak = inject(KeycloakService);
  private readonly notification = inject(NotificationService);

  verifying = signal(true);
  errorMessage = signal('');

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!token) {
      this.verifying.set(false);
      this.errorMessage.set('В ссылке отсутствует токен подтверждения.');
      return;
    }

    try {
      await this.keycloak.verifyEmail(token);
      this.verifying.set(false);
      this.notification.success('Email подтверждён', 'Вы вошли в аккаунт.');
      this.router.navigate(['/home']);
    } catch (error) {
      this.verifying.set(false);
      this.errorMessage.set(
        error instanceof HttpErrorResponse
          ? (error.error?.message ?? 'Не удалось подтвердить email')
          : 'Ссылка недействительна или срок её действия истёк',
      );
    }
  }
}
