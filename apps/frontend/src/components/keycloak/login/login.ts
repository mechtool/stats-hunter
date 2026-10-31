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
  selector: 'sh-login',
  imports: [
    RouterModule,
    ReactiveFormsModule,
    NzButtonModule,
    NzCardModule,
    NzIconModule,
    NzInputModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent {
  private readonly keycloak = inject(KeycloakService);
  private readonly router = inject(Router);
  private readonly notification = inject(NotificationService);

  form = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required]),
  });

  showPassword = false;

  emailError(): string {
    const control = this.form.controls.email;
    if (control.pristine && control.untouched) return '';
    if (control.hasError('required')) return 'Введите email';
    if (control.hasError('email')) return 'Некорректный email';
    return '';
  }

  passwordError(): string {
    const control = this.form.controls.password;
    if (control.pristine && control.untouched) return '';
    if (control.hasError('required')) return 'Введите пароль';
    return '';
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    try {
      await this.keycloak.login(
        this.form.value.email ?? '',
        this.form.value.password ?? '',
      );
      this.notification.success('Вход выполнен', 'Вы успешно вошли.');
      this.router.navigate(['/home']);
    } catch {
      this.notification.error('Ошибка входа', 'Неверный email или пароль');
    }
  }
}
