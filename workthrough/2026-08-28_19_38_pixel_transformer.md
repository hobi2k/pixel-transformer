# Pixel Transformer 제작

## 개요
PNG 픽셀아트를 RGBA 손실 없이 CSS `box-shadow` 코드로 변환하는 React/TypeScript 웹 앱을 제작했다. 다중 이미지 처리와 브라우저 저장 기록, 여러 출력 형식 및 GitHub Pages 배포 구성을 포함했다.

## 주요 변경사항
- 무손실 반복 픽셀 감지와 RGBA 검증 코어 구현
- 압축 HTML, 단일 요소 HTML, CSS+HTML, JSX, JSON 출력 추가
- 다중 PNG 큐와 중복 파일명을 보존하는 ZIP 일괄 저장 추가
- IndexedDB 작업 기록과 설정 복원 추가
- 데스크톱·모바일 반응형 UI 및 원본/CSS 비교 화면 구현

## 결과
- 자동 테스트 14개 통과
- TypeScript 검사 통과
- 프로덕션 빌드 통과
- 48×48/40×24 PNG에서 픽셀 오차 0 확인
- 390px 모바일과 데스크톱에서 가로 넘침·겹침 없음 확인

## 다음 단계
- Web Worker를 이용한 초대형 PNG 변환 처리
- 플랫폼별 코드 길이 프리셋 확장
