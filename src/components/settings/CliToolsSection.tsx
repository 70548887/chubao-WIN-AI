import type { CliHealthSnapshot, CliToolStatus } from './useCliToolsStatus';

interface CliToolsSectionProps {
  health: CliHealthSnapshot | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function ToolCard({ tool }: { tool: CliToolStatus }) {
  const isAvailable = tool.available;
  
  return (
    <div
      style={{
        flex: 1,
        padding: '16px',
        border: `1px solid ${isAvailable ? '#4caf50' : '#f44336'}`,
        borderRadius: '8px',
        backgroundColor: isAvailable ? '#e8f5e9' : '#ffebee',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '12px',
        }}
      >
        <span style={{ fontSize: '24px' }}>{isAvailable ? '✅' : '❌'}</span>
        <strong style={{ fontSize: '16px' }}>{tool.name}</strong>
        {tool.cached && (
          <span
            style={{
              fontSize: '12px',
              padding: '2px 6px',
              backgroundColor: '#ff9800',
              color: 'white',
              borderRadius: '4px',
            }}
          >
            缓存
          </span>
        )}
      </div>

      <div style={{ marginBottom: '8px' }}>
        <strong>状态:</strong>{' '}
        <span style={{ color: isAvailable ? '#2e7d32' : '#c62828' }}>
          {isAvailable ? '可用' : '不可用'}
        </span>
      </div>

      {tool.version && (
        <div style={{ marginBottom: '8px' }}>
          <strong>版本:</strong> {tool.version}
        </div>
      )}

      {tool.source && (
        <div style={{ marginBottom: '8px' }}>
          <strong>来源:</strong> {tool.source}
        </div>
      )}

      {tool.command && (
        <div
          style={{
            marginBottom: '8px',
            fontSize: '13px',
            color: '#666',
            fontFamily: 'monospace',
          }}
        >
          <strong>命令:</strong> {tool.command}
          {tool.args && tool.args.length > 0 && ` ${tool.args.join(' ')}`}
        </div>
      )}

      {tool.checkedAt && (
        <div style={{ marginBottom: '8px', fontSize: '12px', color: '#888' }}>
          <strong>检查时间:</strong>{' '}
          {new Date(tool.checkedAt).toLocaleString('zh-CN')}
        </div>
      )}

      {!isAvailable && tool.error && (
        <div
          style={{
            marginTop: '10px',
            padding: '8px',
            backgroundColor: '#ffcdd2',
            border: '1px solid #ef5350',
            borderRadius: '4px',
            fontSize: '13px',
            color: '#c62828',
          }}
        >
          <strong>错误:</strong> {tool.error}
        </div>
      )}
    </div>
  );
}

export default function CliToolsSection({
  health,
  loading,
  error,
  onRefresh,
}: CliToolsSectionProps) {
  const availableCount = health?.summary.available ?? 0;
  const totalCount = health?.summary.total ?? 0;
  const unavailableCount = health?.summary.unavailable ?? 0;

  return (
    <div className="settings-section" style={{ marginBottom: '20px' }}>
      <h3 style={{ marginBottom: '15px' }}>🔧 CLI 工具状态</h3>

      {health && (
        <div
          style={{
            marginBottom: '15px',
            padding: '10px 15px',
            backgroundColor: availableCount === totalCount ? '#e8f5e9' : '#fff3e0',
            border: `1px solid ${availableCount === totalCount ? '#4caf50' : '#ff9800'}`,
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '15px',
          }}
        >
          <span style={{ fontSize: '20px' }}>
            {availableCount === totalCount ? '🟢' : '⚠️'}
          </span>
          <div>
            <strong>总览:</strong>{' '}
            <span
              style={{
                color:
                  availableCount === totalCount
                    ? '#2e7d32'
                    : availableCount > 0
                    ? '#ef6c00'
                    : '#c62828',
              }}
            >
              {availableCount} / {totalCount} 可用
            </span>
            {unavailableCount > 0 && (
              <span style={{ color: '#c62828', marginLeft: '10px' }}>
                ({unavailableCount} 个不可用)
              </span>
            )}
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: '20px',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        {health?.tools.opencode && <ToolCard tool={health.tools.opencode} />}
        {health?.tools.ohMyOpencode && <ToolCard tool={health.tools.ohMyOpencode} />}
      </div>

      {!health && !loading && !error && (
        <div
          style={{
            padding: '20px',
            textAlign: 'center',
            color: '#666',
            backgroundColor: '#f5f5f5',
            borderRadius: '6px',
          }}
        >
          点击刷新按钮加载 CLI 工具状态
        </div>
      )}

      <button
        onClick={onRefresh}
        disabled={loading}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          backgroundColor: '#2196f3',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        {loading ? (
          <>
            <span>⏳</span>
            <span>刷新中...</span>
          </>
        ) : (
          <>
            <span>🔄</span>
            <span>刷新状态</span>
          </>
        )}
      </button>

      {error && (
        <div
          style={{
            marginTop: '15px',
            padding: '12px',
            backgroundColor: '#ffebee',
            border: '1px solid #ef5350',
            borderRadius: '6px',
            color: '#c62828',
          }}
        >
          <strong>❌ 错误:</strong> {error}
        </div>
      )}
    </div>
  );
}
