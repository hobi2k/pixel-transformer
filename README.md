# Pixel Transformer

PNG 픽셀아트를 RGBA 손실 없이 CSS `box-shadow` 기반 코드로 변환하는 React/TypeScript 도구입니다.

## 주요 기능

- 여러 PNG 선택, 드래그 앤 드롭, 클립보드 붙여넣기
- 정수배 확대 픽셀 블록의 무손실 자동 감지
- 인라인 HTML, 단일 요소 HTML, CSS + HTML, React JSX, JSON 출력
- 여러 결과 ZIP 일괄 저장
- IndexedDB 기반 로컬 변환 기록
- 원본과 CSS 결과의 배경별 비교 및 RGBA 오차 검증

이미지와 기록은 사용자의 브라우저에만 저장됩니다.

## 개발

```bash
npm install
npm run dev
```

## 검증

```bash
npm test
npm run typecheck
npm run build
```
