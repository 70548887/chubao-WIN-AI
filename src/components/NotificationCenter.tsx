import { useState } from 'react';
import { useNotifications, type Notification, type NotificationType } from '../hooks/useNotifications';

const typeIcons: Record<NotificationType, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '❌',
};

const typeColors: Record<NotificationType, string> = {
  info: 'var(--info)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--error)',
};

function NotificationItem({
  notification,
  onRead,
  onRemove,
}: {
  notification: Notification;
  onRead: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return date.toLocaleDateString();
  };

  return (
    <div
      className={`notification-item ${notification.read ? 'read' : 'unread'}`}
      onClick={() => onRead(notification.id)}
    >
      <div
        className="notification-icon"
        style={{ color: typeColors[notification.type] }}
      >
        {typeIcons[notification.type]}
      </div>
      <div className="notification-content">
        <div className="notification-title">{notification.title}</div>
        <div className="notification-message">{notification.message}</div>
        <div className="notification-time">{formatTime(notification.timestamp)}</div>
      </div>
      <button
        className="notification-close"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(notification.id);
        }}
      >
        ✕
      </button>
    </div>
  );
}

export function NotificationCenter() {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
    clearRead,
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="notification-center">
      <button
        className="notification-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="notification-bell">🔔</span>
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <h4>通知中心</h4>
            <div className="notification-actions">
              {unreadCount > 0 && (
                <button onClick={markAllAsRead}>全部已读</button>
              )}
              <button onClick={clearRead}>清除已读</button>
              <button onClick={clearAll}>清空</button>
            </div>
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">暂无通知</div>
            ) : (
              notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRead={markAsRead}
                  onRemove={removeNotification}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Toast 通知组件
export function ToastContainer() {
  const { notifications, removeNotification } = useNotifications();
  
  // 只显示非持久化的通知作为 Toast
  const toastNotifications = notifications.filter(n => !n.persistent);

  return (
    <div className="toast-container">
      {toastNotifications.map((notification) => (
        <div
          key={notification.id}
          className={`toast toast-${notification.type}`}
          onClick={() => removeNotification(notification.id)}
        >
          <span className="toast-icon">{typeIcons[notification.type]}</span>
          <div className="toast-content">
            <div className="toast-title">{notification.title}</div>
            <div className="toast-message">{notification.message}</div>
          </div>
          <button
            className="toast-close"
            onClick={(e) => {
              e.stopPropagation();
              removeNotification(notification.id);
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
