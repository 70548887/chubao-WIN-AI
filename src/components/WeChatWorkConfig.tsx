import { useState, useCallback } from 'react';
import { useWeChatWork } from '../hooks/useWeChatWork';

export function WeChatWorkConfig() {
  const {
    config,
    isLoading,
    lastError,
    isConfigured,
    saveConfig,
    clearConfig,
    testConfig,
  } = useWeChatWork();

  const [corpid, setCorpid] = useState(config?.corpid || '');
  const [corpsecret, setCorpsecret] = useState(config?.corpsecret || '');
  const [agentid, setAgentid] = useState(config?.agentid || '');
  const [touser, setTouser] = useState(config?.touser || '');
  const [toparty, setToparty] = useState(config?.toparty || '');
  const [testResult, setTestResult] = useState<boolean | null>(null);

  const handleSave = useCallback(() => {
    saveConfig({
      corpid: corpid.trim(),
      corpsecret: corpsecret.trim(),
      agentid: agentid.trim(),
      touser: touser.trim() || undefined,
      toparty: toparty.trim() || undefined,
    });
  }, [corpid, corpsecret, agentid, touser, toparty, saveConfig]);

  const handleTest = useCallback(async () => {
    const result = await testConfig();
    setTestResult(result);
    setTimeout(() => setTestResult(null), 3000);
  }, [testConfig]);

  return (
    <div className="wechatwork-config">
      <h3>💬 企业微信应用配置</h3>
      
      <div className="config-form">
        <div className="form-group">
          <label>企业 ID (CorpID) *</label>
          <input
            type="text"
            value={corpid}
            onChange={(e) => setCorpid(e.target.value)}
            placeholder="wwxxxxxxxxxxxxxxxx"
            className="config-input"
          />
          <span className="form-hint">从企业微信管理后台「我的企业」页面获取</span>
        </div>

        <div className="form-group">
          <label>应用凭证密钥 (CorpSecret) *</label>
          <input
            type="password"
            value={corpsecret}
            onChange={(e) => setCorpsecret(e.target.value)}
            placeholder="应用 Secret"
            className="config-input"
          />
          <span className="form-hint">从应用详情页的「凭证与基础信息」获取</span>
        </div>

        <div className="form-group">
          <label>应用 ID (AgentId) *</label>
          <input
            type="text"
            value={agentid}
            onChange={(e) => setAgentid(e.target.value)}
            placeholder="1000002"
            className="config-input"
          />
          <span className="form-hint">从应用详情页获取 AgentId</span>
        </div>

        <div className="form-group">
          <label>接收成员 (可选)</label>
          <input
            type="text"
            value={touser}
            onChange={(e) => setTouser(e.target.value)}
            placeholder="UserID1|UserID2 或 @all"
            className="config-input"
          />
          <span className="form-hint">指定接收消息的成员，多个用 | 分隔，默认 @all</span>
        </div>

        <div className="form-group">
          <label>接收部门 (可选)</label>
          <input
            type="text"
            value={toparty}
            onChange={(e) => setToparty(e.target.value)}
            placeholder="PartyID1|PartyID2"
            className="config-input"
          />
          <span className="form-hint">指定接收消息的部门，多个用 | 分隔</span>
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
            disabled={!corpid.trim() || !corpsecret.trim() || !agentid.trim() || isLoading}
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
          <li>登录企业微信管理后台 (work.weixin.qq.com)</li>
          <li>在「应用管理」中创建自建应用或选择已有应用</li>
          <li>复制「企业ID」(CorpID)、应用「AgentId」和「Secret」</li>
          <li>确保应用有「发送消息」权限，并设置可见成员</li>
          <li>将凭证填入上方输入框，点击「保存配置」</li>
          <li>点击「发送测试」验证配置是否正确</li>
        </ol>
        <p className="help-note">
          <strong>注意：</strong>企业微信应用消息需要正确的 IP 白名单配置，
          如遇发送失败请检查企业微信后台的「企业可信IP」设置。
        </p>
      </div>
    </div>
  );
}
