import { Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzInputModule } from 'ng-zorro-antd/input';
import { KeycloakService } from '../../../app/keycloak/keycloak.service';

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
    NzInputModule,
  ],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class RegisterComponent {
  private readonly keycloak = inject(KeycloakService);

  form = new FormGroup(
    {
      name: new FormControl('', [Validators.required]),
      email: new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', [
        Validators.required,
        Validators.minLength(8),
      ]),
      confirmPassword: new FormControl('', [Validators.required]),
    },
    { validators: passwordsMatch },
  );

  nameError(): string {
    const control = this.form.controls.name;
    if (control.pristine && control.untouched) return '';
    if (control.hasError('required')) return 'Введите имя';
    return '';
  }

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

  onSubmit(): void {
    void this.keycloak.register();
  }
}
