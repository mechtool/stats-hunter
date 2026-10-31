import { Component } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterModule } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzInputModule } from 'ng-zorro-antd/input';

@Component({
  selector: 'sh-login',
  imports: [
    RouterModule,
    ReactiveFormsModule,
    NzButtonModule,
    NzCardModule,
    NzInputModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent {
  form = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required]),
  });

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

  onSubmit(): void {
    // TODO: Keycloak login (OIDC + PKCE)
  }
}
