import { Component, inject } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { KeycloakService } from '../../../app/keycloak/keycloak.service';
import { NotificationService } from '../../../app/services/notification.service';

@Component({
  selector: 'app-forgot-password',
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
      await this.keycloak.requestPasswordReset(this.form.value.email ?? '');
      this.notification.success(
        'Ссылка отправлена',
        'Если такой email зарегистрирован, мы отправили ссылку для сброса пароля.',
      );
      this.router.navigate(['/login']);
    } catch {
      this.notification.error(
        'Ошибка',
        'Не удалось отправить ссылку. Попробуйте позже.',
      );
    } finally {
      this.submitting = false;
    }
  }
}
