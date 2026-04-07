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

> iOS 13+ 에서는 모션 센서 권한을 위해 화면을 먼저 탭한 후 **Enable Sensors** 버튼을 눌러야 합니다.

---

## 센서 지원 현황

| 센서 | 실제 센서 여부 | 비고 |
|------|--------------|------|
| 마이크 / 소음 | ✅ 실제 | `getUserMedia` — HTTPS 또는 localhost 필요 |
| 주변 조도 | ✅ 실제* | `AmbientLightSensor` API (Chrome + 플래그 또는 Android) |
| 기기 기울기 | ✅ 실제 | `DeviceOrientation` — 모바일에서 HTTPS 필요 |
| 배터리 잔량 | ✅ 실제* | `Battery Status API` (Chrome 데스크톱/Android) |
| 화면 밝기 | 🎚 시뮬레이션 | 브라우저 API 없음 — 인앱 슬라이더로 조절 |
| 시각(시간대) | ✅ 실제 | 시스템 시계 — 항상 사용 가능 |

*`*` 표시 항목은 Firefox/Safari에서 개인정보 보호 정책으로 API가 제거되어 슬라이더로 폴백될 수 있습니다.*

---

## 게임 모드

### ▶ Explore Mode (실시간 스텔스 탈출)
- **목표**: 적의 탐지를 피해 탈출 지점에 도달하기
- 플레이어는 기기 기울기(또는 키보드 방향키)로 이동
- 소음이 임계값(`38`)을 초과하면 근처 적이 알림 상태로 전환
- 3초 연속 침묵 유지 시 **스텔스 모드(유령)** 발동
- 어두울수록 적의 탐지 반경 감소, 그림자 커버 발생
- 야간(20–6시) 적 이동 속도·수 증가
- 에너지가 0이 되면 게임 오버

### 🏠 Survive Mode (일별 자원 관리)
- **목표**: 자원·스트레스·체력·피난처 에너지를 관리하며 최대한 오래 생존
- 매 행동마다 실시간 환경(derived)이 결과에 영향
- 제공 행동: **탐색(Explore)**, **휴식(Rest)**, **은신(Hide)**, **충전(Recharge)**, **다음 날(Next Day)**
- 진행 상황은 `localStorage`에 자동 저장

### 🔬 Sensor Test
- 모든 센서 상태 및 실시간 값 확인
- 슬라이더로 폴백 값 수동 조절

---

## 프로젝트 구조

```
inandout/
├── index.html              # 앱 진입점 (SPA 마운트 포인트)
├── style.css               # 전체 스타일
└── js/
    ├── app.js              # 초기화 (엔진 시작 → 홈 화면 이동)
    ├── router.js           # SPA 라우터 (화면 전환)
    ├── nav.js              # 순환 의존성 방지용 navigate 인디렉션
    ├── state.js            # 전역 상태 (sensorRaw, derived, exploreRun, survive, ui)
    ├── storage.js          # localStorage 래퍼
    ├── utils.js            # 공용 유틸 (clamp, lerp, smooth, randInt 등)
    ├── engine/
    │   ├── hybridRealityEngine.js  # 엔진 최상위 (센서 → 인터프리터 → 모드)
    │   ├── environmentReader.js    # 마이크(소음), 주변 조도 센서
    │   ├── deviceReader.js         # 배터리, 기울기(모션), 시각, 키보드 기울기 시뮬레이션
    │   └── interpreter.js          # raw → derived 변환 (visibility, exposure, stealth 등)
    ├── modes/
    │   ├── exploreMode.js  # 실시간 스텔스 탈출 게임 로직
    │   └── surviveMode.js  # 일별 서바이벌 행동 로직 및 랜덤 이벤트
    └── ui/
        ├── screens.js      # 각 화면 DOM 빌드·업데이트
        └── components.js   # 재사용 UI 컴포넌트 (미터, 버튼, 캔버스 등)
```

---

## 아키텍처

```
[실제 센서 / 슬라이더 폴백]
        │
   Layer 1: 센서 입력
   ┌─────────────────────┐
   │ environmentReader   │  마이크(소음), 주변 조도
   │ deviceReader        │  배터리, 기울기, 시각
   └─────────────────────┘
        │  sensorRaw (noiseLevel, ambientLight, tiltX/Y, batteryLevel, brightnessLevel, hour)
        ▼
   Layer 2: 인터프리터 (interpreter.js)
   ┌─────────────────────────────────────────────────────────────────┐
   │  raw → derived 변환 (10Hz 틱, 지수 평활화)                      │
   │  visibility · exposure · stealth · stability · energyModifier   │
   │  · threatLevel                                                   │
   └─────────────────────────────────────────────────────────────────┘
        │  derived (0–100 정규화값)
        ▼
   Layer 3: 게임 모드
   ┌────────────────────┐   ┌──────────────────────┐
   │  exploreMode.js    │   │  surviveMode.js       │
   │  실시간 스텔스 탈출 │   │  일별 자원 관리        │
   └────────────────────┘   └──────────────────────┘
        │
   UI (screens.js + components.js) → DOM
```

엔진은 **10Hz**로 틱하며 각 틱마다:
1. 실제 센서 또는 슬라이더 폴백에서 raw 값을 읽고 지수 평활화 적용
2. `interpreter.js`가 raw → derived 변환 수행
3. 게임 모드(exploreMode/surviveMode)가 derived 값을 소비하여 게임 상태 업데이트

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
| `hybridRealityEngine.js` | 센서 시작·중지, setFallback, 틱 루프 관리, `currentState` 스냅샷 제공 |
| `environmentReader.js` | 마이크(Web Audio API 링버퍼 평균) 및 AmbientLightSensor 래퍼 |
| `deviceReader.js` | Battery Status API, DeviceOrientation(기울기, 데드존 처리), 키보드 기울기 시뮬레이션 |
| `interpreter.js` | raw 센서 → derived 값 수식 변환 + 지수 평활화. `levelLabel()` 인간 친화적 라벨 |
| `exploreMode.js` | 적 스폰·순찰·탐지, 플레이어 이동, 스텔스, 랜덤 이벤트 풀, 점수 계산 |
| `surviveMode.js` | 5가지 행동 함수, 10가지 랜덤 일별 이벤트, 전략적 조언 `getSurviveAdvice()` |
| `screens.js` | 4개 화면(Home, Sensor, Explore, Survive) DOM 빌드·업데이트·teardown |
| `components.js` | buildMeter, buildButton, renderLog, buildSensorRow, buildGameCanvas, showModal |

---

## 브라우저 호환성

| 브라우저 | 마이크 | 조도 | 기울기 | 배터리 |
|---------|--------|------|--------|--------|
| Chrome (데스크톱) | ✅ | ⚠ 플래그 필요 | ❌ 없음 (키보드 시뮬) | ✅ |
| Chrome (Android) | ✅ | ✅ | ✅ | ✅ |
| Firefox | ✅ | ❌ | ✅ | ❌ |
| Safari (iOS 13+) | ✅ | ❌ | ✅ 제스처 필요 | ❌ |
| Safari (macOS) | ✅ | ❌ | ❌ | ❌ |

모든 센서는 graceful degradation — 지원하지 않는 센서는 슬라이더 시뮬레이션으로 자동 폴백되며 게임은 항상 플레이 가능합니다.