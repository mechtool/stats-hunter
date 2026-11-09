import { Component, inject } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { KeycloakService } from '../../../app/keycloak/keycloak.service';
import { NotificationService } from '../../../app/services/notification.service';

@Component({
  selector: 'sh-forgot-password',
  imports: [
    RouterModule,
    ReactiveFormsModule,
    NzButtonModule,
    NzCardModule,
    NzIconModule,
    NzInputModule,
  ],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPasswordComponent {
  private readonly keycloak = inject(KeycloakService);
  private readonly router = inject(Router);
  private readonly notification = inject(NotificationService);

  form = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
  });

  submitting = false;

  emailError(): string {
    const control = this.form.controls.email;
    if (control.pristine && control.untouched) return '';
    if (control.hasError('required')) return 'Введите email';
    if (control.hasError('email')) return 'Некорректный email';
    return '';
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.submitting) return;
    this.submitting = true;
    try {
      const email = this.form.value.email ?? '';
      await this.keycloak.requestPasswordReset(email);
      this.notification.success(
        'Ссылка отправлена',
        'Ссылка для сброса пароля отправлена на ваш email.',
      );
      this.router.navigate(['/check-email'], {
        queryParams: { email, mode: 'reset' },
      });
    } catch (error) {
      let message = 'Не удалось отправить ссылку. Попробуйте позже.';
      if (error instanceof HttpErrorResponse) {
        message = error.error?.message ?? message;
      }
      this.notification.error('Ошибка', message);
    } finally {
      this.submitting = false;
    }
  }
}
