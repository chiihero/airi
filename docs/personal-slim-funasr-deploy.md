# FunASR 本地部署方案（Windows 原生 · 纯 CPU）

> 适用：AIRI 个人精简版的语音识别（STT）后端。本文档给出在无 Docker、无 GPU 的 Windows 环境下，用 pip + venv 部署 FunASR OpenAI 兼容服务的完整步骤。
>
> **部署位置**：`D:\project\MultiProjects\AIRI\stt\`（已加入 `.gitignore`）。
>
> 参考来源：[FunASR 官方教程](https://modelscope.github.io/FunASR/zh/tutorial.html)、[OpenAI API 部署示例](https://github.com/modelscope/FunASR/blob/main/examples/openai_api/README.md)。

## 0. 环境实测摘要

| 项 | 状态 | 说明 |
|----|------|------|
| Python | ✅ 3.10.6 | 官方推荐 3.8–3.12 |
| pip | ✅ 26.1.2（venv 内升级后） | |
| GPU | ❌ 无 | **纯 CPU 部署**，决定模型选 SenseVoice |
| Docker | ❌ | 走 pip 原生路线 |

## 1. 模型选择：SenseVoice-Small

纯 CPU 环境下，[官方模型对比](https://modelscope.github.io/FunASR/zh/tutorial.html) 的推荐：

| 模型 | CPU 适合度 | 速度（10s 音频） | 标点 | 备注 |
|------|-----------|-----------------|------|------|
| **SenseVoice-Small** ⭐ | ✅ 优 | ~70ms | 自带 | 多语言 + 情感检测，CPU 友好首选 |
| Paraformer | ⚠️ 中 | 较慢 | 需配 `ct-punc` | 生产级中文，但 CPU 上偏慢 |
| Fun-ASR-Nano | ✅ 优 | 极快 | 无 | 极致轻量，准确率略低 |

> AIRI 的 FunASR provider 预置了 `sensevoice` / `paraformer` / `paraformer-en` / `fun-asr-nano` 四个模型 id（与 server.py 的 `--model` 取值完全一致）。**实际部署选 `sensevoice`**。

## 2. 部署步骤

### 第 1 步：创建独立 venv

```bash
cd /d/project/MultiProjects/AIRI/stt
python -m venv venv
# 验证
venv/Scripts/python.exe --version    # 应显示 3.10.6
```

> `stt/` 已在 `.gitignore` 中忽略，不会污染 git 状态。

### 第 2 步：安装依赖

```bash
# 升级 pip（venv 自带的 22.x 依赖解析较老）
venv/Scripts/python.exe -m pip install --upgrade pip

# 核心库（funasr 不再硬依赖 torch，但运行时 import torch，需单独装）
venv/Scripts/pip.exe install funasr fastapi uvicorn python-multipart

# NOTICE: funasr 1.3+ 把 torch/torchaudio 从 pip 依赖里移除了（让用户自选 CPU/CUDA 版），
# 但代码里仍硬 import。纯 CPU 环境必须显式装 CPU 版，否则启动报 ModuleNotFoundError。
# 用 PyTorch 官方 CPU 索引（清华镜像不含 +cpu 变体）。
venv/Scripts/pip.exe install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
```

验证导入：
```bash
venv/Scripts/python.exe -c "import torch, torchaudio, funasr; print('all OK', funasr.__version__)"
```

### 第 3 步：启动 OpenAI 兼容服务

`server.py` 已放置在 `stt/` 目录（来自 FunASR 官方 `examples/openai_api/server.py`）。

```bash
# NOTICE: server.py 默认 device=cuda，纯 CPU 环境必须显式 --device cpu，否则启动失败。
venv/Scripts/python.exe server.py --device cpu --host 0.0.0.0 --port 8000 --model sensevoice
```

或直接用启动脚本：
```bash
./start.sh
```

首次启动自动从 ModelScope（国内节点）下载 SenseVoice-Small + fsmn-vad 模型，约 1–2 GB，通常几分钟。

> server.py 支持的 `--model` 取值（与 AIRI provider 预置的模型 id 一致）：
> `sensevoice`（默认，CPU 首选）/ `paraformer` / `paraformer-en` / `fun-asr-nano`。

### 第 4 步：验证服务

另开一个终端：

```bash
# 探活 /v1/models（AIRI 的 validateProviderConfig 就打这个端点）
curl http://localhost:8000/v1/models

# 实际转录测试
curl -X POST http://localhost:8000/v1/audio/transcriptions \
  -H "Authorization: Bearer x" \
  -F "model=sensevoice" \
  -F "file=@some-audio.wav"
```

预期返回 OpenAI 兼容格式：`{"text": "识别出的文字内容"}`。

### 第 5 步：在 AIRI 中配置

启动 AIRI 前端：

```bash
cd /d/project/MultiProjects/AIRI
pnpm -F @proj-airi/stage-web dev
```

进入 **设置 > Hearing（听力）**：
1. Provider 选 **FunASR**
2. Base URL：`http://localhost:8000/v1/`
3. Model：`sensevoice`
4. API Key：填任意非空值（如 `x`，自托管不校验鉴权）

## 3. 与 AIRI 的协议对接（已实现）

AIRI 侧的 FunASR provider（`packages/stage-ui/src/stores/providers.ts`）已配置为：

- `defaultBaseUrl: http://localhost:8000/v1/` —— 与上面的启动命令端口一致
- 走 `generateTranscription`（`@xsai/generate-transcription`）发标准 OpenAI multipart 到 `{baseUrl}/audio/transcriptions`
- 字段 `model` / `file` / `response_format` / `language` / `prompt` 全部匹配 FunASR 端点
- `validateProviderConfig` 探活 `{baseUrl}/models`，无 apiKey 强制校验

详见 provider 定义中的 `// NOTICE:` 注释。

## 4. 常见问题

**Q: 首次启动卡在下载模型？**
ModelScope 默认走国内 CDN。若仍慢，可设环境变量切 HuggingFace 镜像：
```bash
export HF_ENDPOINT=https://hf-mirror.com
```

**Q: `ModuleNotFoundError: No module named 'torch'`？**
funasr 1.3+ 不再自动装 torch。按第 2 步的命令单独装 CPU 版 torch + torchaudio。

**Q: CPU 转录延迟高？**
SenseVoice-Small 在 CPU 上 10s 音频约 70ms，可接受。若仍需更快：
- 换 `fun-asr-nano`（需改 server.py 的 model 参数）
- 或只转录短句（AIRI hearing 默认按 VAD 分段）

**Q: 端口 8000 被占用？**
启动时改 `--port 8001`，同步改 AIRI 设置页的 Base URL。

**Q: 以后想用 GPU 加速？**
装 CUDA 版 PyTorch 后，启动命令改 `--device cuda`。无需改 AIRI 配置。

## 5. 服务管理

```bash
# 停止服务：Ctrl+C 即可（前台）或找到 python 进程 kill（后台）

# 重新启动
cd /d/project/MultiProjects/AIRI/stt
./start.sh

# 卸载（彻底清理）
rm -rf /d/project/MultiProjects/AIRI/stt/venv
# 模型缓存默认在 ~/.cache/modelscope/hub，可一并删除
```

## 6. 实际验证记录（2026-07-03）

部署已在 `D:\project\MultiProjects\AIRI\stt\` 完成并验证：
- torch 2.12.1+cpu / torchaudio 2.11.0+cpu / funasr 1.3.14
- SenseVoice-Small 模型加载成功，`/v1/models` 返回 4 个模型（sensevoice ready）
- 中文语音转录测试通过：输入"你好，这是一个语音识别的测试。今天天气真好。" → 识别为"你好这是一个语音识别的测试今天天气真好"（文字 100% 正确，标点为 SenseVoice 输出特性）

