import { Component, OnInit, inject } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
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
  selector: 'app-reset-password',
  imports: [
    RouterModule,
    ReactiveFormsModule,
    NzButtonModule,
    NzCardModule,
    NzIconModule,
    NzInputModule,
  ],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPasswordComponent implements OnInit {
  private readonly keycloak = inject(KeycloakService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notification = inject(NotificationService);

  form = new FormGroup(
    {
      password: new FormControl('', [
        Validators.required,
        Validators.minLength(8),
      ]),
      confirmPassword: new FormControl('', [Validators.required]),
    },
    { validators: passwordsMatch },
  );

  token = '';
  showPassword = false;
  showConfirmPassword = false;
  submitting = false;

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
  }

  passwordError(): string {
    const control = this.form.controls.password;
    if (control.pristine && control.untouched) return '';
    if (control.hasError('required')) return 'Введите новый пароль';
    if (control.hasError('minlength')) return 'Минимум 8 символов';
    return '';
  }

  confirmPasswordError(): string {
    const control = this.form.controls.confirmPassword;
    if (control.pristine && control.untouched) return '';
    if (control.hasError('required')) return 'Повторите новый пароль';
    if (this.form.hasError('mismatch')) return 'Пароли не совпадают';
    return '';
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.submitting) return;

    if (!this.token) {
      this.notification.error(
        'Неверная ссылка',
        'В ссылке отсутствует токен сброса пароля.',
      );
      return;
    }

    this.submitting = true;
    try {
      await this.keycloak.resetPassword(
        this.token,
        this.form.value.password ?? '',
      );
      this.notification.success(
        'Пароль изменён',
        'Теперь вы можете войти с новым паролем.',
      );
      this.router.navigate(['/login']);
    } catch (error) {
      const message =
        error instanceof HttpErrorResponse
          ? (error.error?.message ?? 'Не удалось изменить пароль')
          : 'Ссылка недействительна или срок её действия истёк';
      this.notification.error('Ошибка сброса пароля', message);
    } finally {
      this.submitting = false;
    }
  }
}
