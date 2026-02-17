import { useState, useCallback, useEffect } from 'react';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  persistent?: boolean;
}

export interface NotificationOptions {
  type?: NotificationType;
  title: string;
  message: string;
  persistent?: boolean;
  showSystem?: boolean;
  duration?: number;
}

const STORAGE_KEY = 'chubao-notifications';
const MAX_NOTIFICATIONS = 50;

// 系统通知权限检查
async function checkNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
}

// 发送系统通知
async function sendSystemNotification(title: string, body: string): Promise<void> {
  try {
    // 尝试使用 Tauri 通知
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      const { sendNotification } = await import('@tauri-apps/plugin-notification');
      sendNotification({ title, body });
      return;
    }
  } catch (error) {
    console.warn('Tauri notification failed:', error);
  }

  // 回退到 Web Notification API
  if (await checkNotificationPermission()) {
    new Notification(title, { body });
  }
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return [];
      }
    }
    return [];
  });

  const [unreadCount, setUnreadCount] = useState(0);

  // 计算未读数
  useEffect(() => {
    setUnreadCount(notifications.filter(n => !n.read).length);
  }, [notifications]);

  // 持久化通知
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
  }, [notifications]);

  // 添加通知
  const addNotification = useCallback(async (options: NotificationOptions) => {
    const notification: Notification = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: options.type || 'info',
      title: options.title,
      message: options.message,
      timestamp: Date.now(),
      read: false,
      persistent: options.persistent ?? false,
    };

    setNotifications(prev => {
      const next = [notification, ...prev];
      // 限制数量，保留持久化的
      if (next.length > MAX_NOTIFICATIONS) {
        const persistent = next.filter(n => n.persistent);
        const nonPersistent = next.filter(n => !n.persistent).slice(0, MAX_NOTIFICATIONS - persistent.length);
        return [...persistent, ...nonPersistent];
      }
      return next;
    });

    // 发送系统通知
    if (options.showSystem !== false) {
      await sendSystemNotification(options.title, options.message);
    }

    // 自动关闭非持久化通知
    if (!options.persistent && options.duration !== 0) {
      const duration = options.duration || 5000;
      setTimeout(() => {
        removeNotification(notification.id);
      }, duration);
    }

    return notification.id;
  }, []);

  // 移除通知
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // 标记已读
  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  // 标记全部已读
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  // 清空通知
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // 清空已读通知
  const clearRead = useCallback(() => {
    setNotifications(prev => prev.filter(n => !n.read));
  }, []);

  // 便捷方法
  const info = useCallback((title: string, message: string, options?: Partial<NotificationOptions>) => {
    return addNotification({ type: 'info', title, message, ...options });
  }, [addNotification]);

  const success = useCallback((title: string, message: string, options?: Partial<NotificationOptions>) => {
    return addNotification({ type: 'success', title, message, ...options });
  }, [addNotification]);

  const warning = useCallback((title: string, message: string, options?: Partial<NotificationOptions>) => {
    return addNotification({ type: 'warning', title, message, ...options });
  }, [addNotification]);

  const error = useCallback((title: string, message: string, options?: Partial<NotificationOptions>) => {
    return addNotification({ type: 'error', title, message, ...options });
  }, [addNotification]);

  return {
    notifications,
    unreadCount,
    addNotification,
    removeNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
    clearRead,
    info,
    success,
    warning,
    error,
  };
}
