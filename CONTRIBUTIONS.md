# DUO에서 맡은 일

[DUO](https://github.com/kanghyunsoon/duo)는 코딩 에이전트가 만든 변경을 사람이 확정한 설계 결정과 대조하고, 판단 근거를 파일과 Git diff로 보여주는 오픈소스 프로젝트입니다. 저는 Codex·Claude Code 연동과 MCP 서버에 기여했습니다.

| 기여 | 구현한 내용 |
| --- | --- |
| [사용자가 만든 설정 파일 보존 · #113](https://github.com/kanghyunsoon/duo/pull/113) | 연결 해제 시 사용자가 이미 가지고 있던 빈 설정 파일이 삭제되는 문제를 수정했습니다. 설치 전 파일 상태를 기록해 도구가 만든 파일과 기존 파일을 구분했습니다. |
| [Codex·Claude Code 연결 · #152](https://github.com/kanghyunsoon/duo/pull/152) | `duoctl setup`에서 두 에이전트를 연결하고, 실제 설정을 쓰기 전에 충돌을 확인할 수 있도록 구현했습니다. |
| [반복 호출 안정성 · #227](https://github.com/kanghyunsoon/duo/pull/227) | MCP 호출마다 반복하던 tree-sitter 문법 로딩을 프로세스당 한 번으로 줄였습니다. 수정 전 172번째 호출이 실패했고, 수정 후 동일한 테스트에서 200번 모두 응답했습니다. |

[프로젝트 README](README.md) · [개발이 진행되는 원본 저장소](https://github.com/kanghyunsoon/duo)
