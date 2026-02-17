import { useState, useCallback } from 'react';
import { useDingTalk } from '../hooks/useDingTalk';

export function DingTalkConfig() {
  const {
    config,
    isLoading,
    lastError,
    isConfigured,
    saveConfig,
    clearConfig,
    testConfig,
  } = useDingTalk();

  const [webhook, setWebhook] = useState(config?.webhook || '');
  const [secret, setSecret] = useState(config?.secret || '');
  const [atMobiles, setAtMobiles] = useState(config?.atMobiles?.join(',') || '');
  const [isAtAll, setIsAtAll] = useState(config?.isAtAll || false);
  const [testResult, setTestResult] = useState<boolean | null>(null);

  const handleSave = useCallback(() => {
    saveConfig({
      webhook: webhook.trim(),
      secret: secret.trim() || undefined,
      atMobiles: atMobiles.split(',').map(s => s.trim()).filter(Boolean),
      isAtAll,
    });
  }, [webhook, secret, atMobiles, isAtAll, saveConfig]);

  const handleTest = useCallback(async () => {
    const result = await testConfig();
    setTestResult(result);
    setTimeout(() => setTestResult(null), 3000);
  }, [testConfig]);

  return (
    <div className="dingtalk-config">
      <h3>🔔 钉钉机器人配置</h3>
      
      <div className="config-form">
        <div className="form-group">
          <label>Webhook 地址 *</label>
          <input
            type="text"
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
            placeholder="https://oapi.dingtalk.com/robot/send?access_token=xxx"
            className="config-input"
          />
          <span className="form-hint">从钉钉群机器人设置中复制 Webhook 地址</span>
        </div>

        <div className="form-group">
          <label>安全设置 - 加签密钥</label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="SECxxxxxxxxxxxxxxxx"
            className="config-input"
          />
          <span className="form-hint">如果启用了加签安全设置，请填写密钥</span>
        </div>

        <div className="form-group">
          <label>@ 手机号列表</label>
          <input
            type="text"
            value={atMobiles}
            onChange={(e) => setAtMobiles(e.target.value)}
            placeholder="13800138000,13900139000"
            className="config-input"
          />
          <span className="form-hint">多个手机号用逗号分隔，发送消息时会 @ 这些人</span>
        </div>

        <div className="form-group checkbox">
          <label>
            <input
              type="checkbox"
              checked={isAtAll}
              onChange={(e) => setIsAtAll(e.target.checked)}
            />
            @ 所有人
          </label>
        </div>

        {lastError && (
          <div className="error-message">
            ❌ {lastError}
          </div>
        )}

        {testResult === true && (
          <div className="success-message">
            ✅ 测试消息发送成功！
          </div>
        )}

        <div className="config-actions">
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={!webhook.trim() || isLoading}
          >
            {isLoading ? '保存中...' : '保存配置'}
          </button>
          
          {isConfigured && (
            <>
              <button
                className="btn-secondary"
                onClick={handleTest}
                disabled={isLoading}
              >
                发送测试
              </button>
              <button
                className="btn-danger"
                onClick={clearConfig}
                disabled={isLoading}
              >
                清除配置
              </button>
            </>
          )}
        </div>
      </div>

      <div className="config-help">
        <h4>配置说明</h4>
        <ol>
          <li>在钉钉群聊中，点击右上角「群设置」→「智能群助手」</li>
          <li>点击「添加机器人」→「自定义」→「添加」</li>
          <li>设置机器人名称，选择安全设置（建议加签）</li>
          <li>复制 Webhook 地址和密钥（如有）到上方输入框</li>
          <li>点击「保存配置」，然后点击「发送测试」验证</li>
        </ol>
      </div>
    </div>
  );
}
