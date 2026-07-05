# 사진 프로필 연동 인수인계

> 작성일: 2026-07-05
> 받는 사람: 안티그래피티
> 남은 작업: [index.html](index.html)의 `PHOTOS` 객체에 선수 사진 URL 채우기

## 지금 상태

티어측정표(`index.html`)는 완성돼서 실행만 하면 바로 보입니다. 브라우저로 `index.html` 열면 끝 — 별도 빌드/서버 필요 없는 순수 정적 페이지입니다.

- 티어 명단(1~8티어 + 유스티어)은 MMR 계산 결과로 이미 확정, `TIERS` 배열에 하드코딩돼 있음
- 종족별 색상(테란 블루/저그 핑크퍼플/토스 골드), 카드 레이아웃, 애니메이션 다 완성
- **딱 하나 남은 것**: 사진이 전부 이니셜 플레이스홀더(`<span class="init">이름 앞 2글자</span>`)로 나오고 있음 — 이걸 실제 프로필 사진으로 바꾸는 게 이번 작업

## 해야 할 일

`index.html` 안의 `PHOTOS` 객체를 채우면 됩니다.

```js
/* 사진 매핑 — 추후 Supabase(eloboard 크롤링 이미지)에서 주입.
   key: 선수명, value: 이미지 URL */
const PHOTOS = {};
```

이 객체에 `{"다린": "https://...", "히엉": "https://...", ...}` 식으로 이름→이미지URL을 채우면, 렌더링 로직(`index.html` 하단 `<script>`)이 자동으로 `PHOTOS[name]`이 있으면 `<img>`로, 없으면 이니셜로 표시하도록 이미 짜여 있습니다. **렌더링 코드는 손댈 필요 없고, `PHOTOS` 데이터만 채우면 끝**입니다.

## 사진 출처 — 크롤러 수정이 아직 안 끝남 (선행 작업 필요)

계획은: eloboard 전적 크롤러(`monstarznew/scripts/collect-data.js`)에 **사진 URL도 같이 수집하도록 추가해서 Supabase에 넣는 것**입니다. **이 크롤러 수정 작업이 아직 안 됐습니다** — 사진 URL을 index.html에 연결하기 전에 이 작업부터 먼저 끝나야 합니다.

**선행 작업 (크롤러 쪽)**
1. `monstarznew/scripts/collect-data.js`가 eloboard 선수 페이지(`bo_table=bj_list` 등)를 파싱하는 부분(`parseEloboardRecords` 근처, 대략 600~700번째 줄)에 프로필 사진 `<img>` 태그 추출 로직 추가
2. 추출한 이미지 URL을 Supabase에 저장 (어느 테이블/컬럼에 넣을지 설계 필요 — 기존 `tier-records` 스토리지 구조 참고)
3. 크롤러를 실제로 돌려서 전 인원 사진 URL을 Supabase에 채워넣기

**그 다음 (안티그래피티 작업)**
4. Supabase에서 이름↔사진URL 매핑을 가져와 `index.html`의 `PHOTOS` 객체에 주입

즉 지금은 4번을 하기 전에 1~3번(크롤러 수정 + 실행)이 먼저 완료되어야 합니다. 이 문서를 받는 분이 크롤러 작업까지 맡는 건지, 아니면 크롤러 작업은 별도로 끝난 뒤에 4번만 맡을지 역할 분담을 먼저 확인하는 게 좋습니다.

**참고용 임시 폴백**: 크롤러 작업 전에 우선 뭐라도 채워야 한다면, **players.json**(monstarznew 로스터)의 `image`/`sourceImage` 필드(SOOP 프로필 URL)를 임시로 쓸 수 있습니다.
  - 경로: `C:\Users\silve\OneDrive\Desktop\MONSTARZNEW_PROJECT_REPOS_20260617-104902\monstarznew\data\manual\players.json`
  - 단, 티어표 인원 중 로스터에서 빠진 사람(예: 으냉이)이나 이름이 다른 사람(예: 다예=얌지금 개명)이 있어서 100% 커버는 안 됨 — 어디까지나 임시 대체용

## 참고할 기존 코드/데이터

- `scripts/lib/seed.js` — 시드 명단 원본 (이름 목록 확인용)
- `data/final-tiers.json` — 지금 index.html에 박혀있는 최종 티어별 명단 원본 (이름+종족+티어)
- `MMR_SYSTEM_DESIGN.md` §10 — 디스플레이 형식 규칙(사진+이름, 종족색, New/복귀자 뱃지)
- `MMR_SYSTEM_DESIGN.md` §11 미결 목록에 "eloboard 프로필 사진 크롤링 추가" 항목이 이미 적혀있음

## 주의할 점

- **이름 매칭 이슈**: 티어표의 이름과 players.json/eloboard의 이름이 다른 경우가 꽤 있었음 (개명, 로스터 이탈 등). `data/final-tiers.json`의 이름 기준으로 최대한 매칭하되, 안 되는 사람은 그냥 이니셜로 남겨둬도 무방(렌더링이 알아서 fallback 처리함)
- 사진 URL을 하드코딩하지 말고, 가능하면 이름→URL 매핑 JSON을 별도 파일로 분리해서 `index.html`에서 fetch하거나 인라인으로 합치는 방식 추천 (지금 `PHOTOS = {}`가 비어있는 자리에 그대로 채워도 되고, 데이터가 많으면 별도 JS 파일로 분리해도 됨)
- 뱃지(`BADGES` 객체, `{"이름": "new"}` 또는 `{"이름": "ret"}`)도 아직 비어있음 — 사진 작업 김에 신규/복귀자 뱃지도 채우면 완성도 올라감 (필수는 아님)

## 완료 기준

1티어부터 유스티어까지 전원(또는 가능한 만큼) 실제 얼굴 사진이 뜨면 끝. 브라우저에서 `index.html` 열어서 육안 확인하면 됨.
