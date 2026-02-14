# Sidecar 鐘舵€佷笌鍋ュ悍妫€鏌ュ绾︼紙Sprint 1锛?
鏇存柊鏃堕棿锛?026-02-13  
鐗堟湰锛歚v1.2.6`  
鐘舵€侊細`frozen`锛堟湰杩唬鍐荤粨锛屽彉鏇撮渶璇勫锛?
## 1. 鐩爣涓庤寖鍥?
鏈绾︾粺涓€浠ヤ笅鎺ュ彛锛屼綔涓?Tauri銆丯ode銆丳ython銆丗rontend銆丵A 骞惰寮€鍙戠殑鍏卞悓鍩虹嚎锛?
1. Tauri 鍛戒护锛歚ensure_sidecars`銆乣sidecar_status`銆乣restart_sidecar`銆乣sidecar_logs`銆乣sidecar_diagnostics`銆乣sidecar_port_inspect`
2. Sidecar 鍋ュ悍鎺ュ彛锛歚GET /health`锛圢ode銆丳ython锛?3. HTTP 涓氬姟閿欒鍝嶅簲鏍煎紡锛圢ode銆丳ython锛?4. 鍓嶇璇婃柇瀵煎嚭鏍煎紡锛歚diagnostics.v1.2`锛堝吋瀹硅鍙?`diagnostics.v1.1`锛?
## 2. 鍛藉悕瑙勮寖

1. JSON 瀛楁缁熶竴浣跨敤 `camelCase`
2. 甯冨皵瀛楁浣跨敤鏄庣‘璇箟锛歚running`銆乣healthy`銆乣managed`
3. 閿欒鐮佷娇鐢ㄥ叏澶у啓涓嬪垝绾匡細`SERVICE_UNAVAILABLE`

## 3. Tauri 鍛戒护濂戠害

### 3.1 `ensure_sidecars`

鍔熻兘锛氱‘淇?Node/Python sidecar 宸插惎鍔紝骞惰繑鍥炲綋鍓嶇姸鎬佸揩鐓с€? 
杩斿洖绫诲瀷锛歚SidecarStatus`

### 3.2 `sidecar_status`

鍔熻兘锛氫粎杩斿洖褰撳墠鐘舵€佸揩鐓э紝涓嶄富鍔ㄩ噸鍚湇鍔°€? 
杩斿洖绫诲瀷锛歚SidecarStatus`

### 3.3 `restart_sidecar`

鍔熻兘锛氭寜鏈嶅姟鍚嶉噸鍚?sidecar锛屽苟杩斿洖閲嶅惎鍚庣殑鐘舵€佸揩鐓с€? 
璇锋眰鍙傛暟锛?
```json
{
  "service": "node"
}
```

鍙傛暟瑙勫垯锛?
1. `service` 鍏佽鍊硷細`node`銆乣python`
2. 鑻ョ洰鏍囨湇鍔′负鈥滃閮ㄦ墭绠♀€濓紙`managed=false` 涓?`healthy=true`锛夛紝杩斿洖閿欒锛堢姝㈤噸鍚閮ㄨ繘绋嬶級

杩斿洖绫诲瀷锛歚SidecarStatus`

### 3.4 `sidecar_logs`

鍔熻兘锛氳鍙?sidecar 鏈€杩戞棩蹇楋紙鎸夋湇鍔＄淮搴︼級銆? 
璇锋眰鍙傛暟锛?
```json
{
  "service": "python",
  "limit": 120
}
```

鍙傛暟瑙勫垯锛?
1. `service` 鍏佽鍊硷細`node`銆乣python`
2. `limit` 鍙€夛紝鑼冨洿 `1..500`

杩斿洖绫诲瀷锛?
```json
{
  "service": "python",
  "lines": [
    "[1739450000000][Python Automation] process started, pid=12345",
    "[1739450001000][Python Automation stdout] ...",
    "[1739450002000][Python Automation] health check passed on port 3200"
  ]
}
```

### 3.5 `SidecarStatus` 缁撴瀯

```json
{
  "node": {
    "name": "Node.js Backend",
    "running": true,
    "healthy": true,
    "managed": true,
    "pid": 12345,
    "port": 3100,
    "endpoint": "http://127.0.0.1:3100/health",
    "lastError": null
  },
  "python": {
    "name": "Python Automation",
    "running": true,
    "healthy": true,
    "managed": true,
    "pid": 12346,
    "port": 3200,
    "endpoint": "http://127.0.0.1:3200/health",
    "lastError": null
  }
}
```

瀛楁璇存槑锛坄ServiceStatus`锛夛細

1. `name: string` 鏈嶅姟鍚嶏紙灞曠ず鐢ㄩ€旓級
2. `running: boolean` 鏈嶅姟鏄惁鍦ㄨ繍琛岋紙杩涚▼瀛樻椿鎴栧仴搴风鐐瑰彲杈撅級
3. `healthy: boolean` `/health` 鏄惁閫氳繃
4. `managed: boolean` 鏄惁鐢?Tauri 褰撳墠杩涚▼鎵樼
5. `pid: number | null` 鎵樼杩涚▼ PID锛涘閮ㄦ墭绠℃椂涓?`null`
6. `port: number` 鐩戝惉绔彛
7. `endpoint: string` 鍋ュ悍妫€鏌ュ湴鍧€
8. `lastError: string | null` 鏈€杩戜竴娆″惎鍔ㄦ垨鐘舵€佹鏌ラ敊璇?
### 3.6 `sidecar_diagnostics`

鍔熻兘锛氳繑鍥?Sidecar 鐘舵€?+ `/health` 璇︽儏锛屼緵鍓嶇灞曠ず鐗堟湰銆佷緷璧栫姸鎬佺瓑淇℃伅銆? 
璇箟锛氬彧璇绘煡璇紝涓嶄富鍔ㄩ噸鍚湇鍔°€? 
杩斿洖绫诲瀷锛歚SidecarDiagnostics`

```json
{
  "node": {
    "status": {
      "name": "Node.js Backend",
      "running": true,
      "healthy": true,
      "managed": true,
      "pid": 12345,
      "port": 3100,
      "endpoint": "http://127.0.0.1:3100/health",
      "lastError": null
    },
    "health": {
      "status": "ok",
      "service": "node-backend",
      "version": "0.1.0",
      "uptimeSec": 27,
      "timestamp": "2026-02-13T14:00:00.000Z",
      "deps": {
        "memory": "ok",
        "gateway": "ok"
      }
    },
    "healthError": null
  },
  "python": {
    "status": {
      "name": "Python Automation",
      "running": true,
      "healthy": true,
      "managed": true,
      "pid": 12346,
      "port": 3200,
      "endpoint": "http://127.0.0.1:3200/health",
      "lastError": null
    },
    "health": {
      "status": "ok",
      "service": "python-automation",
      "version": "0.1.0",
      "uptimeSec": 24,
      "timestamp": "2026-02-13T14:00:01.000Z",
      "deps": {
        "gui": "ok",
        "ocr": "ok",
        "screenshot": "ok"
      },
      "ocr": {
        "dependencies": {
          "paddleocr": true,
          "paddle": true
        },
        "engineInitialized": true,
        "apiVersion": "v3",
        "lastError": null
      }
    },
    "healthError": null
  }
}
```

### 3.6.1 `sidecar_port_inspect`

鍔熻兘锛氭寜鏈嶅姟鏌ヨ绔彛鐩戝惉鍗犵敤鏄庣粏锛堢敤浜庢帓鏌?`EADDRINUSE` / 澶栭儴杩涚▼鍗犵敤锛夈€? 
璇锋眰鍙傛暟锛?```json
{
  "service": "node"
}
```

杩斿洖绫诲瀷锛?```json
{
  "service": "node",
  "port": 3100,
  "listening": true,
  "managedPid": 12345,
  "hasConflict": false,
  "inspectedAtMs": 1739520000000,
  "occupants": [
    {
      "pid": 12345,
      "processName": "node",
      "localAddress": "::",
      "commandLine": "node .../tsx/dist/cli.mjs watch src/index.ts"
    }
  ]
}
```

### 3.7 `diagnostics.v1.2` 瀵煎嚭缁撴瀯锛堝墠绔級

鍓嶇璁剧疆椤靛鍑虹殑 JSON锛坰chemaVersion=`diagnostics.v1.2`锛夊湪淇濈暀 `diagnostics.node/python` 鏄庣粏鐨勫悓鏃讹紝
鏂板椤跺眰 `pythonOcrSummary` 蹇収瀛楁锛岀敤浜庡閮ㄨ剼鏈揩閫熻鍙?OCR 灏辩华鎯呭喌銆?
Additional top-level snapshot: `portConflictSummary` for fast conflict triage in exported files.
```json
{
  "schemaVersion": "diagnostics.v1.2",
  "exportedAt": "2026-02-14T09:05:00.000Z",
  "app": "chubao-win-ai",
  "appVersion": "0.1.0",
  "pythonOcrSummary": {
    "state": "ok",
    "dependencies": {
      "paddleocr": true,
      "paddle": true
    },
    "engineInitialized": true,
    "apiVersion": "v3",
    "lastError": null
  },
  "portConflictSummary": {
    "node": {
      "port": 3100,
      "listening": true,
      "hasConflict": false,
      "managedPid": 12345,
      "occupants": 1,
      "occupantPids": [12345]
    },
    "python": {
      "port": 3200,
      "listening": true,
      "hasConflict": false,
      "managedPid": 12346,
      "occupants": 1,
      "occupantPids": [12346]
    }
  },
  "diagnostics": {
    "node": {},
    "python": {}
  }
}
```

瀛楁瑙勫垯锛坄pythonOcrSummary`锛夛細

1. `state: string`锛屾潵婧愪簬 `diagnostics.python.health.deps.ocr`锛屽缓璁€硷細`ok/degraded/unknown`
2. `dependencies: { paddleocr?: boolean, paddle?: boolean }`锛屾潵婧愪簬 Python `/health.ocr.dependencies`
3. `engineInitialized: boolean | null`锛屾潵婧愪簬 `/health.ocr.engineInitialized`
4. `apiVersion: string | null`锛屾潵婧愪簬 `/health.ocr.apiVersion`
5. `lastError: string | null`锛屾潵婧愪簬 `/health.ocr.lastError`

`portConflictSummary` fields:
1. `node/python.port: number | null` source: `diagnostics.<service>.portInspection.port`
2. `node/python.listening: boolean | null` source: `diagnostics.<service>.portInspection.listening`
3. `node/python.hasConflict: boolean | null` source: `diagnostics.<service>.portInspection.hasConflict`
4. `node/python.managedPid: number | null` source: `diagnostics.<service>.portInspection.managedPid`
5. `node/python.occupants: number` source: `diagnostics.<service>.portInspection.occupants.length`
6. `node/python.occupantPids: number[]` source: each `occupants[*].pid`

鍏煎绛栫暐锛?
1. 瀵煎嚭缁熶竴鍐欏叆 `diagnostics.v1.2`
2. 瀵煎叆瀵规瘮鍏煎 `diagnostics.v1.1`锛堟彁绀哄吋瀹规ā寮忥級
3. 缂哄け `schemaVersion` 鐨勫巻鍙叉枃浠舵寜 legacy 妯″紡 best-effort 瑙ｆ瀽

## 4. Sidecar `/health` 缁熶竴濂戠害

Node 涓?Python 閮藉繀椤昏繑鍥炰互涓嬬粨鏋勶紙瀛楁榻愬叏锛夛細

```json
{
  "status": "ok",
  "service": "node-backend",
  "version": "0.1.0",
  "uptimeSec": 12,
  "timestamp": "2026-02-13T14:00:00.000Z",
  "deps": {
    "memory": "ok",
    "ocr": "ok"
  }
}
```

瀛楁瑙勫垯锛?
1. `status: "ok" | "degraded" | "error"`
2. `service: string`锛坄node-backend` 鎴?`python-automation`锛?3. `version: string`锛堣涔夌増鏈級
4. `uptimeSec: number`锛堣繘绋嬪惎鍔ㄥ悗绉掓暟锛?5. `timestamp: string`锛圛SO-8601锛?6. `deps: Record<string, string>`锛堜緷璧栫粍浠跺仴搴锋憳瑕侊紝鍊煎缓璁?`ok/degraded/error/disabled`锛?
## 5. HTTP 閿欒鍝嶅簲濂戠害

鎵€鏈変笟鍔℃帴鍙ｅけ璐ユ椂锛岃繑鍥烇細

```json
{
  "success": false,
  "errorCode": "INVALID_ARGUMENT",
  "message": "window_title is required",
  "details": {
    "field": "window_title"
  },
  "requestId": "3dc8756e-61f8-4cc8-bd58-bac2b7e29e8c"
}
```

瀛楁瑙勫垯锛?
1. `success` 鍥哄畾涓?`false`
2. `errorCode` 鏈哄櫒鍙閿欒鐮?3. `message` 浜虹被鍙閿欒淇℃伅
4. `details` 鍙€夛紝缁撴瀯鍖栬ˉ鍏呬俊鎭?5. `requestId` 鍙€夛紝鐢ㄤ簬鏃ュ織杩借釜

寤鸿閿欒鐮侀泦鍚堬紙Sprint 1锛夛細

1. `INVALID_ARGUMENT`
2. `SERVICE_UNAVAILABLE`
3. `DEPENDENCY_UNAVAILABLE`
4. `TIMEOUT`
5. `INTERNAL_ERROR`

## 6. 鍏煎绛栫暐

鍦?Sprint 1 鍐呭厑璁哥煭鏈熷吋瀹规棫瀛楁锛屼絾鍓嶇鍙緷璧栨湰濂戠害瀛楁銆? 
鍏煎绐楀彛缁撴潫鍚庯紝鏃у瓧娈靛簲绉婚櫎銆?
## 7. 楠屾敹鍛戒护

1. `Invoke-RestMethod http://127.0.0.1:3100/health | ConvertTo-Json -Depth 4`
2. `Invoke-RestMethod http://127.0.0.1:3200/health | ConvertTo-Json -Depth 4`
3. 鍓嶇璋冪敤 `ensure_sidecars` 涓?`sidecar_status`锛岀‘璁ゅ瓧娈甸綈鍏ㄤ笖绫诲瀷绗﹀悎鏈绾?
## 8. 闈炲吋瀹瑰彉鏇磋鍒?
鏈枃浠舵爣璁颁负 `frozen` 鍚庯細

1. 鏂板瀛楁锛氬厑璁革紙鍚戝悗鍏煎锛?2. 鍒犻櫎瀛楁锛氱姝?3. 瀛楁閲嶅懡鍚嶏細绂佹
4. 瀛楁绫诲瀷淇敼锛氱姝?
濡傞渶淇敼锛屽繀椤诲厛鏇存柊鏈枃浠剁増鏈苟閫氳繃璇勫銆?

## 9. Sprint 3 API Addendum (2026-02-14)

This addendum defines newer Node backend semantics used by Sprint 3 multi-agent capabilities.

### 9.1 Error Code Extensions

Additional `errorCode` values in HTTP error payload:

1. `FORBIDDEN` -> HTTP `403`
2. `NOT_FOUND` -> HTTP `404`

`NOT_FOUND` is used when a resource identifier is syntactically valid but missing at runtime, for example:

1. `GET /api/multi-agent/groups/:groupId` with unknown `groupId`
2. `POST /api/multi-agent/groups/:groupId/cancel` with unknown `groupId`

### 9.2 Multi-Agent HTTP Routes

Routes:

1. `POST /api/multi-agent/start`
2. `GET /api/multi-agent/groups`
3. `GET /api/multi-agent/groups/:groupId`
4. `POST /api/multi-agent/groups/:groupId/cancel`

Validation failures return `INVALID_ARGUMENT` with HTTP `400`.
Missing group resources return `NOT_FOUND` with HTTP `404`.
Capacity/availability failures return `SERVICE_UNAVAILABLE` with HTTP `503`.

### 9.3 Multi-Agent Capacity Controls

Coordinator enforces running-capacity limits before accepting a new group.

Environment variables:

1. `CHUBAO_MULTI_AGENT_MAX_RUNNING_GROUPS`

- Type: positive integer
- Default: `5`
- Meaning: max number of simultaneously `running` groups

2. `CHUBAO_MULTI_AGENT_MAX_RUNNING_TASKS`

- Type: positive integer
- Default: `20`
- Meaning: max number of simultaneously `running` tasks across all groups

When any limit is exceeded, start request fails with:

1. `errorCode: SERVICE_UNAVAILABLE`
2. HTTP status `503`
3. message prefix: `multi-agent service unavailable`

### 9.4 Multi-Agent Group List Query/Response

`GET /api/multi-agent/groups` supports optional query parameters:

1. `state`: `all|running|completed|failed|canceled|partial`
2. `limit`: integer `>= 1`
3. `offset`: integer `>= 0`

Invalid query values return `INVALID_ARGUMENT` with HTTP `400`.

Response payload shape:

```json
{
  "success": true,
  "groups": {
    "count": 12,
    "groups": [
      {
        "groupId": "uuid",
        "state": "running",
        "createdAt": "2026-02-14T10:00:00.000Z",
        "finishedAt": null,
        "totalTasks": 3,
        "startedTasks": 3
      }
    ],
    "page": {
      "limit": 50,
      "offset": 0,
      "returned": 1
    },
    "capacity": {
      "runningGroups": 2,
      "runningTasks": 6,
      "maxRunningGroups": 5,
      "maxRunningTasks": 20
    }
  }
}
```

### 9.5 Browser Automation Addendum (Read/Form APIs)

Python sidecar exposes additional browser APIs:

1. `POST /api/browser/read_page`
2. `POST /api/browser/get_text`
3. `POST /api/browser/form_input`

Request/response semantics:

1. `/api/browser/read_page`

- Optional request fields: `include_html`, `include_forms`, `max_html_chars`
- Returns `result` with: `url`, `title`, `html`, `html_length`, `html_truncated`, `text_excerpt`, `text_length`, `forms`, `form_count`

2. `/api/browser/get_text`

- Optional request fields: `selector`, `max_chars`, `normalize_whitespace`, `timeout_ms`
- Returns `result` with: `url`, `selector`, `text`, `text_length`, `truncated`

3. `/api/browser/form_input`

- Required request field: `fields` (non-empty selector-value map)
- Optional request fields: `clear`, `submit`, `submit_selector`, `timeout_ms`
- Returns `result` with: `url`, `applied_count`, `applied`, `submitted`

Validation/error contract:

1. Invalid/missing required fields return `INVALID_ARGUMENT` with HTTP `400`
2. Missing Playwright dependency returns `DEPENDENCY_UNAVAILABLE` with HTTP `503`

### 9.6 Runtime Security Policy Addendum

Node endpoint `GET /api/tools` returns additional `security` payload:

```json
{
  "success": true,
  "tools": [],
  "sandbox": {},
  "security": {
    "mode": "warn",
    "allowHighRisk": false,
    "maxStringLength": 12000,
    "maxArrayLength": 50,
    "maxDepth": 8,
    "configuredAllowedTools": [],
    "configuredBlockedTools": [],
    "blockedArgumentPatterns": ["&&", "||", "`", "$(...)"],
    "readonlyTools": [],
    "highRiskTools": []
  }
}
```

Environment controls:

1. `CHUBAO_SECURITY_MODE`: `off|warn|enforce` (default: `warn`)
2. `CHUBAO_SECURITY_ALLOW_HIGH_RISK`: `true|false` (default: `false`)
3. `CHUBAO_SECURITY_ALLOWED_TOOLS`: comma-separated explicit allowlist
4. `CHUBAO_SECURITY_BLOCKED_TOOLS`: comma-separated explicit denylist
5. `CHUBAO_SECURITY_MAX_STRING_LENGTH`: positive integer
6. `CHUBAO_SECURITY_MAX_ARRAY_LENGTH`: positive integer
7. `CHUBAO_SECURITY_MAX_DEPTH`: positive integer
8. `CHUBAO_SECURITY_BLOCKED_ARG_PATTERNS`: comma-separated suspicious command patterns

Enforcement semantics:

1. In `off` mode, decisions are not blocked.
2. In `warn` mode, risky/invalid patterns emit warnings but remain executable.
3. In `enforce` mode, denied calls return `FORBIDDEN` with message containing `blocked by security policy`.

### 9.7 OpenCode Task State Addendum

OpenCode wrapper task runtime state supports persistence/recovery semantics.

Environment variables:

1. `CHUBAO_OPENCODE_TASK_STATE_ENABLED`
2. `CHUBAO_OPENCODE_TASK_STATE_PATH`
3. `CHUBAO_OPENCODE_TASK_RETENTION_MS`
4. `CHUBAO_OPENCODE_MAX_TASKS`

Persistence semantics:

1. State file schema version: `opencode-tasks.v1`
2. Process-restart recovery marks previously `running` tasks as `failed` with recovery reason
3. Retention/size cleanup removes stale completed/failed/canceled records

Tool-level query semantics:

1. `opencode_list_tasks` supports optional `state|limit|offset`
2. `opencode_check_concurrent_status` returns summary counts and task snapshots
