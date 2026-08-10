# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-08-10

### Added
- AI-powered service analysis ("Analyze with AI") on the service detail page — the narrative streams in via Server-Sent Events, with severity, category, and a recommendation delivered once the stream completes.
- Deterministic severity calculation from uptime, response time, trend, and failure rate — the model never decides severity.
- Interchangeable AI provider (OpenAI, Anthropic, or Google) via the Vercel AI SDK.
- Global monthly and per-user daily budget limits on AI analyses.
- Persisted analysis history (narrative, token usage, latency, provider/model) in a new `Analysis` table.

### Documentation
- Documented the AI Analysis feature and its environment variables in the README.

[Unreleased]: https://github.com/KamerrEzz/pulsecheck/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/KamerrEzz/pulsecheck/releases/tag/v1.1.0
