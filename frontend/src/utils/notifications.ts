import { Toaster, ToastProps } from '@gravity-ui/uikit';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface NotificationOptions {
  message: string;
  description?: string;
  duration?: number;
}

interface ConfirmOptions {
  title: string;
  content?: string;
  onOk?: () => void | Promise<void>;
  onCancel?: () => void;
  okText?: string;
  cancelText?: string;
  okType?: 'default' | 'primary' | 'dashed' | 'link' | 'text' | 'danger';
}

// Global Toaster instance
export const toaster = new Toaster();

class NotificationService {
  private showToast(type: ToastProps['theme'], options: NotificationOptions) {
    toaster.add({
      name: `${type}-${Date.now()}`,
      title: options.message,
      content: options.description,
      theme: type,
      autoHiding: options.duration ? options.duration * 1000 : 4500,
      isClosable: true,
    });
  }

  success(options: NotificationOptions): void {
    this.showToast('success', options);
  }

  error(options: NotificationOptions): void {
    this.showToast('danger', options);
  }

  warning(options: NotificationOptions): void {
    this.showToast('warning', options);
  }

  info(options: NotificationOptions): void {
    this.showToast('info', options);
  }

  private confirmHandler: ((options: ConfirmOptions) => Promise<boolean>) | null = null;

  registerConfirmHandler(handler: (options: ConfirmOptions) => Promise<boolean>): void {
    this.confirmHandler = handler;
  }

  unregisterConfirmHandler(): void {
    this.confirmHandler = null;
  }

  // Fallback for confirm using native window.confirm if context provider is not mounted
  async confirm(options: ConfirmOptions): Promise<boolean> {
    if (this.confirmHandler) {
      return this.confirmHandler(options);
    }
    const text = options.content ? `${options.title}\n\n${options.content}` : options.title;
    const confirmed = window.confirm(text);
    if (confirmed && options.onOk) {
      await options.onOk();
    } else if (!confirmed && options.onCancel) {
      options.onCancel();
    }
    return confirmed;
  }

  confirmDelete(options: Omit<ConfirmOptions, 'okType'>): Promise<boolean> {
    return this.confirm(options);
  }
}

export const notifications = new NotificationService();

export const showSuccess = (message: string, description?: string) => {
  notifications.success({ message, description });
};

export const showError = (message: string, description?: string) => {
  notifications.error({ message, description });
};

export const showWarning = (message: string, description?: string) => {
  notifications.warning({ message, description });
};

export const showInfo = (message: string, description?: string) => {
  notifications.info({ message, description });
};

export const showConfirm = (options: ConfirmOptions): Promise<boolean> => {
  return notifications.confirm(options);
};

export const showConfirmDelete = (
  title: string,
  content?: string,
  onOk?: () => void | Promise<void>
): Promise<boolean> => {
  return notifications.confirmDelete({ title, content, onOk });
};
