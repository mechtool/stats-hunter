import { Component } from '@angular/core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCardModule } from 'ng-zorro-antd/card';
import { NzInputModule } from 'ng-zorro-antd/input';

@Component({
  selector: 'sh-login',
  imports: [NzButtonModule, NzCardModule, NzInputModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent {}
