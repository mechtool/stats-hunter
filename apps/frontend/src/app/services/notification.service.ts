import { Injectable, inject } from '@angular/core';
import { NzNotificationService } from 'ng-zorro-antd/notification';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

/**
 * Shared notification service. Wraps ng-zorro NzNotificationService so the
 * rest of the app gets one place for toast-style messages. The notification
 * colour follows the type: success (green), error (red), warning (orange),
 * info (blue).
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly notification = inject(NzNotificationService);

  show(type: NotificationType, title: string, content?: string): void {
    this.notification.create(type, title, content ?? '');
  }

  success(title: string, content?: string): void {
    this.show('success', title, content);
  }

  error(title: string, content?: string): void {
    this.show('error', title, content);
  }

  warning(title: string, content?: string): void {
    this.show('warning', title, content);
  }

  info(title: string, content?: string): void {
    this.show('info', title, content);
  }
}
