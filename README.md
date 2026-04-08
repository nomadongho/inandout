# IN & OUT — Hybrid Reality Survival Game

실제 환경(소음·조도·기울기·배터리·시각)이 게임 세계에 직접 반영되는 **하이브리드 리얼리티 서바이벌 게임**입니다.  
빌드 과정 없이 `index.html`을 브라우저에서 바로 열어 플레이할 수 있습니다.

---

## 목차

1. [실행 방법](#실행-방법)
2. [센서 지원 현황](#센서-지원-현황)
3. [게임 모드](#게임-모드)
4. [프로젝트 구조](#프로젝트-구조)
5. [아키텍처](#아키텍처)
6. [파일별 역할](#파일별-역할)
7. [브라우저 호환성](#브라우저-호환성)

---

## 실행 방법

```bash
# 방법 1: 직접 열기 (마이크·모션 없이 슬라이더 폴백으로 플레이 가능)
open index.html

# 방법 2: 마이크·모션 센서 사용 시 로컬 서버 필요 (HTTPS 또는 localhost)
python3 -m http.server 8080
# → 브라우저에서 http://localhost:8080 접속
```

> **iOS 13+**: 모션 센서 권한을 위해 화면을 먼저 탭한 후 **Enable Sensors** 버튼을 눌러야 합니다.  
> **데스크톱**: 모션 센서가 없으면 키보드 방향키(↑↓←→)로 기울기를 시뮬레이션합니다.

---

## 센서 지원 현황

| 센서 | 종류 | 사용 API | 비고 |
|------|------|----------|------|
| 마이크 / 소음 | ✅ 실제 | `getUserMedia` + Web Audio API | HTTPS 또는 localhost 필요 |
| 주변 조도 | ✅ 실제* | `AmbientLightSensor` | Chrome + 플래그 또는 Android |
| 기기 기울기 | ✅ 실제 | `DeviceOrientationEvent` | 모바일에서 HTTPS 필요, iOS 13+ 제스처 필요 |
| 배터리 잔량 | ✅ 실제* | `Battery Status API` | Chrome 데스크톱/Android |
| 화면 밝기 | 🎚 시뮬레이션 | 인앱 슬라이더 | 브라우저 API 미지원 |
| 시각(시간대) | ✅ 실제 | 시스템 시계 | 항상 사용 가능 |

`*` 표시 항목은 Firefox/Safari에서 개인정보 보호 정책으로 API가 제거되어 슬라이더로 폴백될 수 있습니다.

모든 센서는 **Graceful Degradation** 방식으로 동작합니다. 지원하지 않는 센서는 자동으로 슬라이더 폴백으로 전환되며, 게임은 항상 플레이 가능합니다.

---

## 게임 모드

### ▶ Explore Mode — 실시간 스텔스 탈출

벽·그림자·조명이 있는 스테이지 맵에서 감시원의 눈을 피해 탈출 지점까지 도달하는 실시간 스텔스 게임입니다.

**기본 규칙**

- **이동**: 기기 기울기 또는 키보드 방향키로 플레이어 이동
- **승리**: 탈출 지점(초록 ▶) 반경 안에 도달
- **패배**: 에너지가 0이 되면 게임 오버

**센서와 게임 메커니즘**

| 센서 값 | 게임 영향 |
|---------|---------|
| 소음 높음 | 플레이어 탐지 반경 증가, 주변 감시원 경계 상태 전환 |
| 소음 낮음 (3초 지속) | **스텔스 모드(유령)** 발동 — 탐지 반경 최소화 |
| 주변 조도 낮음 | 그림자 커버 발생, 감시원 시야 범위 감소 |
| 기울기 급격한 변화 | **발 헛딛음(Stumble)** 발생 — 에너지 손실 + 소음 이벤트 |
| 배터리 낮음 (25% 이하) | 이동 속도 감소 |
| 야간 (20시–6시) | 감시원 이동 속도 및 경계 민감도 증가 |

**감시원(Watcher) AI — 7단계 상태 머신**

```
IDLE → SUSPICIOUS → LISTENING → INVESTIGATING → ALERTED → CHASING → RETURNING
```

- **IDLE**: 사전 설정된 경로를 순찰
- **SUSPICIOUS**: 약한 신호 감지 — 소리 방향으로 시선 전환
- **LISTENING**: 증거 평가 중 — 신뢰도를 쌓거나 잃음
- **INVESTIGATING**: 소리 발생 위치로 이동
- **ALERTED**: 높은 신뢰도 — 공격적 구역 탐색
- **CHASING**: 시각 확인 — 플레이어 직접 추적
- **RETURNING**: 추적 실패 — 순찰 경로로 복귀

감시원은 벽에 의해 차단되는 **시야각(FOV) 콘**과 **음향 전파 모델**(거리 감쇠 + 벽 차단)을 조합하여 탐지합니다.

**감시원 그룹 종류**

| 그룹 | 특성 |
|------|------|
| Standard (0) | 균형 잡힌 시야와 청각 |
| Scout (1) | 좁은 시야, 예민한 청각, 빠른 이동 |
| Guardian (2) | 넓은 시야, 둔한 청각, 느린 이동 |

**스테이지 구성 요소**

- **벽(walls)**: 이동 충돌 + 시야·소리 차단
- **소품(props)**: 박스(crate), 책상(desk), 기계(machine) — 엄폐물
- **그림자 구역(shadowZones)**: 어두운 영역, 플레이어 노출 감소
- **조명 구역(lightZones)**: 밝은 영역, 노출 증가
- **탈출 지점(escapePoints)**: 목표 위치

---

### 🏠 Survive Mode — 일별 자원 관리

매일 제한된 횟수의 행동을 선택하며 최대한 오래 생존하는 턴제 전략 게임입니다. 진행 상황은 `localStorage`에 자동 저장됩니다.

**관리해야 할 자원**

| 자원 | 초기값 | 설명 |
|------|--------|------|
| 자원 (Resources) | 50 | 식량·보급품 (0이 되면 건강 감소) |
| 스트레스 (Stress) | 20 | 누적될수록 행동 효율 저하 |
| 체력 (Health) | 80 | 0이 되면 게임 오버 |
| 피난처 에너지 (Shelter Energy) | 60 | 안전 기지의 에너지 |

**행동 종류** (하루 최대 3회)

| 행동 | 효과 | 환경 영향 |
|------|------|---------|
| 탐색 (Explore) | 자원 획득 | 밝을수록 수확 증가, 위협 높으면 위험 |
| 휴식 (Rest) | 체력·스트레스 회복 | 소음 높으면 효과 감소 |
| 은신 (Hide) | 스트레스 감소, 안전 확보 | 어두울수록 효과 증가 |
| 충전 (Recharge) | 피난처 에너지 보충 | 배터리 높을수록 효율 증가 |
| 다음 날 (Next Day) | 하루 종료, 자원 자동 소모 | — |

- 같은 행동을 하루에 반복할수록 효율이 감소합니다 (2회: ×0.7, 3회 이상: ×0.5).
- 매일 랜덤 이벤트(10종)가 발생하여 자원 상황에 영향을 줍니다.

---

### 🔬 Sensor Test

- 모든 센서의 실시간 상태와 수치 확인
- 슬라이더로 폴백 값 수동 조절 가능
- 실제 센서 사용 여부 표시

---

## 프로젝트 구조

```
inandout/
├── index.html                    # 앱 진입점 (SPA 마운트 포인트)
├── style.css                     # 전체 스타일
└── js/
    ├── app.js                    # 초기화 (엔진 시작 → Survive 상태 복원 → 홈 이동)
    ├── router.js                 # SPA 라우터 (화면 전환)
    ├── nav.js                    # 순환 의존성 방지용 navigate 인디렉션
    ├── state.js                  # 전역 상태 (sensorRaw, derived, exploreRun, survive, ui)
    ├── storage.js                # localStorage 래퍼 (inandout_ 접두사)
    ├── utils.js                  # 공용 유틸 (clamp, lerp, smooth, randInt 등)
    ├── engine/
    │   ├── hybridRealityEngine.js  # 엔진 최상위 (센서 → 인터프리터 → 모드)
    │   ├── environmentReader.js    # 마이크(소음), 주변 조도 센서
    │   ├── deviceReader.js         # 배터리, 기울기(모션), 시각, 키보드 기울기 시뮬레이션
    │   └── interpreter.js          # raw → derived 변환 (visibility, exposure, stealth 등)
    ├── explore/
    │   ├── stageData.js            # 스테이지 맵 정의 (벽, 그림자/조명 구역, 감시원 스폰)
    │   ├── geometry.js             # 이동 충돌 처리, 시야 직선(LOS), 그림자/조명 판정
    │   ├── soundSystem.js          # 소리 이벤트 생성·전파·벽 감쇠
    │   └── watcherAI.js            # 감시원 7-상태 AI (순찰 → 의심 → 추적 등)
    ├── modes/
    │   ├── exploreMode.js          # 실시간 스텔스 탈출 게임 로직
    │   └── surviveMode.js          # 일별 서바이벌 행동 로직 및 랜덤 이벤트
    └── ui/
        ├── screens.js              # 4개 화면(Home, Sensor, Explore, Survive) DOM 빌드·업데이트
        └── components.js           # 재사용 UI 컴포넌트 (미터, 버튼, 캔버스, 모달 등)
```

---

## 아키텍처

```
[실제 센서 / 슬라이더 폴백]
        │
   Layer 1: 센서 입력
   ┌──────────────────────┐
   │ environmentReader    │  마이크(Web Audio 링버퍼 평균), AmbientLightSensor
   │ deviceReader         │  Battery Status API, DeviceOrientationEvent, 키보드 시뮬
   └──────────────────────┘
        │ sensorRaw
        │  noiseLevel 0–100 · ambientLight 0–100 · tiltX/Y -1–1
        │  batteryLevel 0–100 · brightnessLevel 0–100 · hour 0–23
        ▼
   Layer 2: 인터프리터 (interpreter.js)
   ┌─────────────────────────────────────────────────────────┐
   │  raw → derived 변환 (10 Hz 틱, 지수 평활화 per 값)       │
   │  visibility · exposure · stealth · stability            │
   │  energyModifier · threatLevel   (모두 0–100)            │
   └─────────────────────────────────────────────────────────┘
        │ derived (0–100 정규화값)
        ▼
   Layer 3: 게임 모드
   ┌─────────────────────────┐   ┌──────────────────────────┐
   │  exploreMode.js         │   │  surviveMode.js          │
   │  실시간 스텔스 탈출      │   │  일별 자원 관리           │
   │  ├ stageData.js         │   │  (턴제, localStorage 저장) │
   │  ├ geometry.js          │   └──────────────────────────┘
   │  ├ soundSystem.js       │
   │  └ watcherAI.js         │
   └─────────────────────────┘
        │
   UI Layer
   ┌─────────────────────────────────────────────┐
   │  screens.js + components.js → DOM 렌더링    │
   └─────────────────────────────────────────────┘
```

**엔진 틱 루프** (10 Hz, 100 ms 간격):

1. 실제 센서 또는 슬라이더 폴백에서 raw 값 읽기 + 지수 평활화 적용
2. `interpreter.js`가 raw → derived 변환 수행
3. 게임 모드(`exploreMode` / `surviveMode`)가 derived 값을 소비하여 게임 상태 업데이트
4. UI가 상태를 읽어 DOM 반영

**derived 값 수식 요약**

| 값 | 수식 요약 |
|----|---------|
| `visibility` | 일조(시간) × 30 + 주변조도 × 0.4 + 밝기 × 0.3 |
| `exposure` | 소음 × 0.4 + 주변조도 × 0.3 + 일조 × 20 + 밝기 × 0.1 |
| `stealth` | 100 − 소음 × 0.5 − 기울기 × 15 + 어둠 × 0.2 |
| `stability` | 100 − 기울기크기 × 70 (sqrt 비선형) |
| `energyModifier` | 배터리 × 0.6 + 정적 × 0.2 + 야간 × 20 |
| `threatLevel` | 소음 × 0.35 + 주변조도 × 0.25 + (100−stealth) × 0.2 |

---

## 파일별 역할

| 파일 | 역할 |
|------|------|
| `app.js` | DOMContentLoaded 후 엔진 시작 → Survive 상태 복원 → 홈 화면 이동 |
| `router.js` | `navigate(name)` 호출 시 현재 화면 teardown → 새 화면 build |
| `nav.js` | router↔screens 순환 의존성 방지를 위한 얇은 인디렉션 레이어 |
| `state.js` | 앱 전체 공유 상태 객체 (sensorRaw, derived, exploreRun, survive, ui) |
| `storage.js` | `inandout_` 접두사를 붙인 localStorage 키/값 저장·불러오기 |
| `utils.js` | clamp, lerp, mapRange, smooth, randInt, randFloat, pickRandom, formatTime, debounce |
| `engine/hybridRealityEngine.js` | 센서 시작·중지, setFallback, 10 Hz 틱 루프 관리, `currentState` 스냅샷 제공 |
| `engine/environmentReader.js` | 마이크(Web Audio API 링버퍼 평균) 및 AmbientLightSensor 래퍼 |
| `engine/deviceReader.js` | Battery Status API, DeviceOrientation(데드존 처리), 키보드 기울기 시뮬레이션 |
| `engine/interpreter.js` | raw 센서 → derived 값 수식 변환 + 지수 평활화. `levelLabel()` 인간 친화적 라벨 |
| `explore/stageData.js` | 스테이지 레이아웃 정의 (벽, 소품, 그림자/조명 구역, 감시원 스폰, 탈출 지점) |
| `explore/geometry.js` | AABB 충돌, 시야 직선(LOS) 판정, 그림자/조명 구역 포함 여부 검사 |
| `explore/soundSystem.js` | 소리 이벤트 생성·수명 관리·거리 감쇠·벽 차단 감쇠 계산 |
| `explore/watcherAI.js` | 감시원 생성 및 7-상태 AI 업데이트 (시야 콘 + 소리 기억 기반 탐지) |
| `modes/exploreMode.js` | 스테이지 로드, 플레이어 이동, 발 헛딛음, 스텔스 모드, 랜덤 이벤트, 점수 계산 |
| `modes/surviveMode.js` | 5가지 행동 함수, 10가지 랜덤 일별 이벤트, 반복 페널티, `getSurviveAdvice()` |
| `ui/screens.js` | 4개 화면(Home, Sensor, Explore, Survive) DOM 빌드·업데이트·teardown |
| `ui/components.js` | buildMeter, buildButton, renderLog, buildSensorRow, buildGameCanvas, showModal |

---

## 브라우저 호환성

| 브라우저 | 마이크 | 조도 | 기울기 | 배터리 |
|---------|--------|------|--------|--------|
| Chrome (데스크톱) | ✅ | ⚠ 플래그 필요 | ❌ 키보드 시뮬 | ✅ |
| Chrome (Android) | ✅ | ✅ | ✅ | ✅ |
| Firefox | ✅ | ❌ | ✅ | ❌ |
| Safari (iOS 13+) | ✅ | ❌ | ✅ 제스처 필요 | ❌ |
| Safari (macOS) | ✅ | ❌ | ❌ | ❌ |

지원하지 않는 센서는 슬라이더 시뮬레이션으로 자동 폴백되며 게임은 항상 플레이 가능합니다.