import { Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
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

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return password && confirm && password === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'sh-register',
  imports: [
    RouterModule,
    ReactiveFormsModule,
    NzButtonModule,
    NzCardModule,
    NzIconModule,
    NzInputModule,
  ],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class RegisterComponent {
  private readonly keycloak = inject(KeycloakService);
  private readonly router = inject(Router);
  private readonly notification = inject(NotificationService);

  form = new FormGroup(
    {
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', [
        Validators.required,
        Validators.minLength(8),
      ]),
      confirmPassword: new FormControl('', [Validators.required]),
    },
    { validators: passwordsMatch },
  );

  showPassword = false;
  showConfirmPassword = false;

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
    if (control.hasError('minlength')) return 'Минимум 8 символов';
    return '';
  }

  confirmPasswordError(): string {
    const control = this.form.controls.confirmPassword;
    if (control.pristine && control.untouched) return '';
    if (control.hasError('required')) return 'Повторите пароль';
    if (this.form.hasError('mismatch')) return 'Пароли не совпадают';
    return '';
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    try {
      const email = this.form.value.email ?? '';
      await this.keycloak.register(email, this.form.value.password ?? '');
      this.router.navigate(['/check-email'], {
        queryParams: { email },
      });
    } catch (error) {
      let message = 'Ошибка регистрации';
      if (error instanceof HttpErrorResponse) {
        message =
          error.status === 409
            ? 'Пользователь уже существует'
            : (error.error?.message ?? 'Ошибка регистрации');
      }
      this.notification.error('Ошибка регистрации', message);
    }
  }
}
