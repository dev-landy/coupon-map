export const styles = `
  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    min-height: 100%;
    background: #ecebe7;
  }

  body {
    color: #15151a;
    font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  button {
    font: inherit;
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  .appShell {
    position: relative;
    min-height: 100dvh;
    overflow: hidden;
    background: #ecebe7;
  }

  .mapCanvas {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #f3f2ee;
  }

  .mapCanvas::before {
    position: absolute;
    z-index: 0;
    inset: 0;
    background:
      linear-gradient(180deg, rgba(255,255,255,.44), rgba(255,255,255,0) 42%),
      #f3f2ee;
    content: "";
  }

  .isMapLoading::after {
    position: absolute;
    z-index: 2;
    inset: 0;
    background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,.58) 48%, transparent 66%);
    content: "";
    animation: mapLoadingSweep 1.8s ease-in-out infinite;
    transform: translateX(-100%);
  }

  .providerMap {
    position: absolute;
    z-index: 1;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    pointer-events: none;
    transition: opacity .2s ease;
  }

  .hasProviderMap .providerMap {
    opacity: 1;
    pointer-events: auto;
  }

  .mapStatus {
    position: absolute;
    z-index: 6;
    left: 50%;
    top: 42%;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    min-height: 40px;
    transform: translate(-50%, -50%);
    border: 1px solid rgba(21,21,26,.08);
    border-radius: 999px;
    padding: 0 14px;
    background: rgba(255,255,255,.92);
    color: #46464f;
    font-size: 13px;
    font-weight: 900;
    box-shadow: 0 12px 30px rgba(20,20,30,.1);
    white-space: nowrap;
  }

  .mapStatus-error,
  .mapStatus-missing-key {
    color: #5b5b63;
  }

  .mapStatusSpinner {
    width: 14px;
    height: 14px;
    border: 2px solid rgba(245,64,44,.22);
    border-top-color: #f5402c;
    border-radius: 50%;
    animation: mapStatusSpin .7s linear infinite;
  }

  .mapSoftLayer {
    position: absolute;
    z-index: 4;
    inset: 0;
    background:
      linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,0) 34%),
      radial-gradient(circle at 18% 18%, rgba(255,255,255,.38), transparent 28%);
    pointer-events: none;
  }

  @keyframes mapLoadingSweep {
    to {
      transform: translateX(100%);
    }
  }

  @keyframes mapStatusSpin {
    to {
      transform: rotate(360deg);
    }
  }

  .notice {
    position: fixed;
    z-index: 50;
    top: 76px;
    left: 18px;
    width: min(420px, calc(100vw - 36px));
    border: 1px solid #f5d565;
    border-radius: 8px;
    padding: 10px 12px;
    background: #fff8d8;
    color: #5f4700;
    font-size: 13px;
    font-weight: 800;
    box-shadow: 0 10px 24px rgba(20,20,30,.1);
  }

  .notice.error {
    border-color: #fecdca;
    background: #fffbfa;
    color: #b42318;
  }

  .myLocation {
    position: absolute;
    z-index: 5;
    left: 0;
    top: 0;
    width: 46px;
    height: 46px;
    transform: translate3d(var(--user-x, 50vw), var(--user-y, 50vh), 0) translate(-50%, -50%);
    border-radius: 50%;
    background: rgba(46,118,255,.12);
    pointer-events: none;
    will-change: transform;
  }

  .myLocation::before {
    position: absolute;
    inset: 10px;
    border-radius: 50%;
    background: rgba(46,118,255,.2);
    content: "";
  }

  .myLocation span {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 14px;
    height: 14px;
    transform: translate(-50%, -50%);
    border: 3px solid #fff;
    border-radius: 50%;
    background: #2e76ff;
    box-shadow: 0 2px 8px rgba(20,20,30,.22);
  }

  .mapTopChrome {
    position: absolute;
    z-index: 32;
    left: 18px;
    top: 18px;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: calc(100vw - 460px);
  }

  .mapBrand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 46px;
    border: 1px solid rgba(21,21,26,.1);
    border-radius: 8px;
    padding: 0 14px 0 10px;
    background: rgba(255,255,255,.96);
    color: #15151a;
    font-size: 19px;
    font-weight: 650;
    letter-spacing: 0;
    box-shadow: 0 12px 28px rgba(20,20,30,.14);
    white-space: nowrap;
  }

  .mapBrandIcon {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    flex: 0 0 auto;
  }

  .mapActions {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .mapFeedbackButton {
    min-height: 46px;
    border: 1px solid rgba(21,21,26,.1);
    border-radius: 8px;
    padding: 0 14px;
    background: #15151a;
    color: #fff;
    font-size: 14px;
    font-weight: 900;
    box-shadow: 0 12px 28px rgba(20,20,30,.16);
    cursor: pointer;
    white-space: nowrap;
    transition: transform .16s ease, opacity .16s ease;
  }

  .locateButton {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 46px;
    height: 46px;
    border: 1px solid rgba(21,21,26,.1);
    border-radius: 8px;
    background: rgba(255,255,255,.96);
    color: #15151a;
    box-shadow: 0 12px 28px rgba(20,20,30,.16);
    cursor: pointer;
    transition: transform .16s ease, opacity .16s ease;
  }

  .mapFeedbackButton:hover:not(:disabled),
  .locateButton:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .locateButton:disabled {
    cursor: default;
    opacity: .58;
  }

  .marker {
    position: absolute;
    z-index: 20;
    left: 0;
    top: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    transform: translate3d(var(--pin-x, 0px), var(--pin-y, 0px), 0) translate(-50%, -100%);
    border: 0;
    padding: 0;
    background: transparent;
    color: #15151a;
    cursor: pointer;
    transition: opacity .16s ease;
    will-change: transform;
  }

  .marker.isFallbackPosition {
    left: var(--pin-x);
    top: var(--pin-y);
    transform: translate(-50%, -100%);
  }

  .marker.isProjected:not([data-projected="true"]) {
    opacity: 0;
    pointer-events: none;
  }

  .pinBubble {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 38px;
    border: 1px solid rgba(20,20,30,.08);
    border-radius: 999px;
    padding: 4px 11px 4px 4px;
    background: #fff;
    box-shadow: 0 8px 18px rgba(20,20,30,.17);
    white-space: nowrap;
    transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease;
  }

  .marker.selected {
    z-index: 30;
  }

  .marker.selected .pinBubble {
    border-color: #f5402c;
    box-shadow: 0 12px 28px rgba(245,64,44,.28);
    transform: scale(1.06);
  }

  .pinLogo,
  .brandLogo,
  .storeLogo {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    background: var(--brand-color, #15151a);
    color: #fff;
    font-weight: 900;
    line-height: 1;
    letter-spacing: 0;
    white-space: nowrap;
  }

  .brandBadge[data-brand-logo="kfc"] {
    font-family: Arial, Helvetica, sans-serif;
    text-transform: uppercase;
  }

  .brandBadge[data-brand-logo="mcdonalds"],
  .brandBadge[data-brand-logo="burgerking"] {
    padding: 0 2px;
    text-align: center;
    white-space: normal;
    word-break: break-all;
  }

  .pinLogo {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    font-size: 11px;
  }

  .pinLogo.brandBadge[data-brand-logo="mcdonalds"],
  .pinLogo.brandBadge[data-brand-logo="burgerking"] {
    font-size: 9px;
    line-height: 1.05;
  }

  .pinLogo.brandBadge[data-brand-logo="mcdonalds"] {
    width: 42px;
    padding: 0 4px;
    font-size: 10px;
    white-space: nowrap;
    word-break: keep-all;
  }

  .pinDeal {
    display: flex;
    align-items: baseline;
    gap: 3px;
  }

  .pinDeal small,
  .couponRowDeal small {
    color: #9a9aa2;
    font-size: 10px;
    font-weight: 800;
  }

  .pinDeal b {
    color: #f5402c;
    font-size: 15px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }

  .pinTail {
    width: 14px;
    height: 8px;
    margin-top: -1px;
    background: #fff;
    clip-path: polygon(50% 100%, 0 0, 100% 0);
    filter: drop-shadow(0 2px 1px rgba(20,20,30,.08));
  }

  .marker:focus-visible,
  .couponListRow:focus-visible,
  .openAppButton:focus-visible,
  .reportCouponButton:focus-visible,
  .mapFeedbackButton:focus-visible,
  .emptyFeedbackButton:focus-visible,
  .feedbackCloseButton:focus-visible,
  .feedbackSecondaryButton:focus-visible,
  .feedbackSubmitButton:focus-visible,
  .panelToggle:focus-visible,
  .locateButton:focus-visible {
    outline: 3px solid rgba(46,118,255,.32);
    outline-offset: 3px;
  }

  .empty {
    position: absolute;
    z-index: 12;
    left: 50%;
    top: 44%;
    display: grid;
    width: min(340px, calc(100vw - 40px));
    transform: translate(-50%, -50%);
    gap: 8px;
    border: 1px solid rgba(21,21,26,.08);
    border-radius: 8px;
    padding: 18px;
    background: rgba(255,255,255,.94);
    color: #5b5b63;
    text-align: center;
    box-shadow: 0 14px 34px rgba(20,20,30,.14);
  }

  .empty strong {
    color: #15151a;
    font-size: 18px;
  }

  .emptyFeedbackButton {
    justify-self: center;
    min-height: 38px;
    border: 1px solid rgba(21,21,26,.1);
    border-radius: 8px;
    padding: 0 12px;
    background: #15151a;
    color: #fff;
    font-size: 13px;
    font-weight: 900;
    cursor: pointer;
  }

  .panelDock {
    position: fixed;
    z-index: 35;
    top: 22px;
    right: 22px;
    bottom: 22px;
    width: min(420px, calc(100vw - 76px));
    pointer-events: none;
    transition: transform .22s ease;
  }

  .panelDock.isPanelClosed {
    transform: translateX(calc(100% + 22px));
  }

  .panelToggle {
    position: absolute;
    z-index: 3;
    top: 50%;
    left: -46px;
    display: grid;
    place-items: center;
    width: 40px;
    height: 52px;
    transform: translateY(-50%);
    border: 1px solid rgba(21,21,26,.08);
    border-radius: 8px;
    background: rgba(255,255,255,.96);
    color: #15151a;
    box-shadow: 0 12px 28px rgba(20,20,30,.16);
    cursor: pointer;
    pointer-events: auto;
  }

  .panelToggleIcon {
    transition: transform .22s ease;
  }

  .panelDock.isPanelClosed .panelToggleIcon {
    transform: rotate(180deg);
  }

  .couponPanel {
    position: absolute;
    z-index: 1;
    inset: 0;
    display: flex;
    width: 100%;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(21,21,26,.08);
    border-radius: 8px;
    background: rgba(255,255,255,.97);
    box-shadow: 0 24px 60px rgba(20,20,30,.22);
    opacity: 1;
    pointer-events: auto;
    transition: opacity .16s ease;
  }

  .panelDock.isPanelClosed .couponPanel {
    opacity: 0;
    pointer-events: none;
  }

  .panelDock.isSheetDragging {
    transition: none;
  }

  .sheetDragArea {
    flex: 0 0 auto;
  }

  .sheetHandle {
    display: none;
    width: 42px;
    height: 4px;
    flex: 0 0 auto;
    border-radius: 2px;
    margin: 9px auto 0;
    background: #dbdbdf;
  }

  .panelHeader {
    display: grid;
    gap: 12px;
    flex: 0 0 auto;
    padding: 18px 18px 14px;
    border-bottom: 1px solid #ececef;
  }

  .panelScroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }

  .panelScroll::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .eyebrow {
    color: #f5402c;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  h1 {
    margin-top: 2px;
    color: #15151a;
    font-size: 22px;
    line-height: 1.15;
    letter-spacing: 0;
  }

  .stats {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .stats span,
  .sectionHeader span {
    border: 1px solid #ececef;
    border-radius: 999px;
    padding: 5px 8px;
    background: #f7f7f5;
    color: #5b5b63;
    font-size: 12px;
    font-weight: 800;
  }

  .selectedDetail {
    display: grid;
    gap: 12px;
    flex: 0 0 auto;
    padding: 16px 18px;
    border-bottom: 1px solid #ececef;
  }

  .selectedHead {
    display: grid;
    grid-template-columns: 50px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: start;
  }

  .brandLogo {
    width: 50px;
    height: 50px;
    border-radius: 8px;
    font-size: 16px;
  }

  .brandLogo.brandBadge[data-brand-logo="mcdonalds"],
  .brandLogo.brandBadge[data-brand-logo="burgerking"] {
    font-size: 13px;
    line-height: 1.08;
  }

  .brandLogo.brandBadge[data-brand-logo="kfc"] {
    width: 42px;
    height: 42px;
    font-size: 13px;
  }

  .selectedHead p {
    color: #15151a;
    font-size: 17px;
    font-weight: 900;
    letter-spacing: 0;
  }

  .selectedHead h2 {
    overflow-wrap: anywhere;
    color: #15151a;
    font-size: 15px;
    line-height: 1.3;
    letter-spacing: 0;
  }

  .selectedHead div span {
    display: block;
    margin-top: 3px;
    color: #9a9aa2;
    font-size: 13px;
    font-weight: 700;
  }

  .selectedHead strong {
    color: #f5402c;
    font-size: 22px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .couponFacts {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin: 0;
  }

  .couponFacts div {
    display: grid;
    grid-template-columns: auto auto;
    gap: 5px;
    align-items: center;
    border: 1px solid #ececef;
    border-radius: 999px;
    padding: 5px 8px;
    background: #f7f7f5;
    font-size: 12px;
  }

  .couponFacts dt {
    color: #777780;
    font-weight: 800;
  }

  .couponFacts dd {
    margin: 0;
    color: #15151a;
    font-weight: 900;
  }

  .selectedActions {
    display: grid;
    gap: 8px;
  }

  .openAppButton {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 52px;
    border: 0;
    border-radius: 8px;
    background: #f5402c;
    color: #fff;
    font-size: 16px;
    font-weight: 900;
    cursor: pointer;
  }

  .reportCouponButton {
    width: 100%;
    min-height: 42px;
    border: 1px solid #ececef;
    border-radius: 8px;
    background: #fff;
    color: #46464f;
    font-size: 14px;
    font-weight: 900;
    cursor: pointer;
  }

  .sectionHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 0 0 auto;
    padding: 14px 18px 8px;
  }

  .sectionHeader h2 {
    color: #15151a;
    font-size: 15px;
    font-weight: 900;
  }

  .couponList {
    display: grid;
    align-content: start;
    border-top: 1px solid #ececef;
  }

  .couponListRow {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    width: 100%;
    border: 0;
    border-bottom: 1px solid #ececef;
    padding: 14px 18px;
    background: #fff;
    color: inherit;
    cursor: pointer;
    text-align: left;
    transition: background .16s ease, box-shadow .16s ease;
  }

  .couponListRow.selected {
    background: #f7f7f5;
    box-shadow: inset 3px 0 0 #f5402c;
  }

  .storeLogo {
    width: 42px;
    height: 42px;
    border-radius: 8px;
    font-size: 13px;
  }

  .storeLogo.brandBadge[data-brand-logo="mcdonalds"],
  .storeLogo.brandBadge[data-brand-logo="burgerking"] {
    font-size: 11px;
    line-height: 1.08;
  }

  .couponRowCopy {
    min-width: 0;
  }

  .couponRowTitle {
    display: flex;
    min-width: 0;
    align-items: baseline;
    gap: 6px;
  }

  .couponRowTitle h3 {
    overflow: hidden;
    color: #15151a;
    font-size: 15px;
    font-weight: 900;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .couponRowTitle span {
    flex: 0 0 auto;
    border-radius: 6px;
    padding: 2px 6px;
    background: #fff1ee;
    color: #f5402c;
    font-size: 11px;
    font-weight: 900;
    white-space: nowrap;
  }

  .couponRowCopy p,
  .couponRowCopy address {
    overflow: hidden;
    color: #5b5b63;
    font-size: 12px;
    font-style: normal;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .couponRowCopy p {
    margin-top: 3px;
  }

  .couponRowDeal {
    display: grid;
    justify-items: end;
    gap: 2px;
    min-width: 72px;
  }

  .couponRowDeal strong {
    color: #f5402c;
    font-size: 18px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .feedbackOverlay {
    position: fixed;
    z-index: 80;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(21,21,26,.36);
  }

  .feedbackDialog {
    display: grid;
    gap: 14px;
    width: min(430px, 100%);
    max-height: calc(100dvh - 40px);
    overflow: auto;
    border: 1px solid rgba(21,21,26,.1);
    border-radius: 8px;
    padding: 18px;
    background: #fff;
    color: #15151a;
    box-shadow: 0 24px 80px rgba(20,20,30,.28);
  }

  .feedbackHeader {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 14px;
  }

  .feedbackHeader h2 {
    margin-top: 2px;
    font-size: 20px;
    line-height: 1.2;
  }

  .feedbackCloseButton {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 1px solid #ececef;
    border-radius: 8px;
    background: #f7f7f5;
    color: #46464f;
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
  }

  .feedbackField {
    display: grid;
    gap: 7px;
  }

  .feedbackField span {
    color: #46464f;
    font-size: 13px;
    font-weight: 900;
  }

  .feedbackField select,
  .feedbackField textarea,
  .feedbackField input {
    width: 100%;
    border: 1px solid #d7d7dc;
    border-radius: 8px;
    background: #fff;
    color: #15151a;
    font: inherit;
    font-size: 14px;
  }

  .feedbackField select,
  .feedbackField input {
    min-height: 42px;
    padding: 0 11px;
  }

  .feedbackField textarea {
    resize: vertical;
    min-height: 120px;
    padding: 11px;
    line-height: 1.45;
  }

  .feedbackTrap {
    position: absolute;
    left: -9999px;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .feedbackError {
    border: 1px solid #fecdca;
    border-radius: 8px;
    padding: 9px 10px;
    background: #fffbfa;
    color: #b42318;
    font-size: 13px;
    font-weight: 800;
  }

  .feedbackSuccess {
    display: grid;
    gap: 5px;
    border: 1px solid #abefc6;
    border-radius: 8px;
    padding: 14px;
    background: #f6fef9;
  }

  .feedbackSuccess strong {
    color: #067647;
    font-size: 17px;
    font-weight: 900;
  }

  .feedbackSuccess span {
    color: #46464f;
    font-size: 13px;
    font-weight: 800;
  }

  .feedbackActions {
    display: flex;
    justify-content: end;
    gap: 8px;
  }

  .feedbackSecondaryButton,
  .feedbackSubmitButton {
    min-height: 42px;
    border-radius: 8px;
    padding: 0 14px;
    font-size: 14px;
    font-weight: 900;
    cursor: pointer;
  }

  .feedbackSecondaryButton {
    border: 1px solid #d7d7dc;
    background: #fff;
    color: #46464f;
  }

  .feedbackSubmitButton {
    border: 0;
    background: #f5402c;
    color: #fff;
  }

  .feedbackCloseButton:disabled,
  .feedbackSecondaryButton:disabled,
  .feedbackSubmitButton:disabled {
    cursor: not-allowed;
    opacity: .58;
  }

  @media (max-width: 760px) {
    .appShell {
      --mobile-sheet-height: min(74dvh, 620px, calc(100dvh - 92px));
    }

    .notice {
      top: calc(max(14px, env(safe-area-inset-top)) + 54px);
      left: 14px;
      width: calc(100vw - 28px);
    }

    .mapTopChrome {
      top: max(14px, env(safe-area-inset-top));
      right: 14px;
      left: 14px;
      justify-content: space-between;
      gap: 8px;
      max-width: none;
    }

    .mapBrand {
      min-height: 42px;
      padding: 0 12px;
      font-size: 17px;
    }

    .mapActions {
      position: fixed;
      z-index: 34;
      right: 14px;
      bottom: calc(var(--mobile-sheet-height) + 12px);
      flex: 0 0 auto;
      gap: 6px;
      transform: translateY(
        calc(var(--mobile-action-base-y, 0px) + var(--sheet-drag-y, 0px))
      );
      transition: transform .22s ease;
    }

    .mapActions.isPanelClosed {
      bottom: max(14px, env(safe-area-inset-bottom));
      transform: none;
    }

    .mapActions.isSheetDragging {
      transition: none;
    }

    .mapFeedbackButton {
      min-height: 42px;
      padding: 0 11px;
      font-size: 13px;
    }

    .locateButton {
      width: 42px;
      height: 42px;
    }

    .panelDock {
      top: auto;
      right: 0;
      bottom: 0;
      left: 0;
      width: auto;
      height: var(--mobile-sheet-height);
    }

    .panelDock.isPanelClosed {
      transform: translateY(100%);
    }

    .panelDock.isPanelOpen {
      transform: translateY(calc(var(--sheet-base-y, 0px) + var(--sheet-drag-y, 0px)));
    }

    .sheetDragArea {
      cursor: grab;
      touch-action: none;
    }

    .panelDock.isSheetDragging .sheetDragArea {
      cursor: grabbing;
    }

    .panelToggle {
      display: none;
      top: -56px;
      right: 14px;
      left: auto;
      width: 48px;
      height: 48px;
      transform: none;
    }

    .panelDock.isPanelOpen .panelToggleIcon {
      transform: rotate(90deg);
    }

    .panelDock.isPanelClosed .panelToggleIcon {
      transform: rotate(-90deg);
    }

    .couponPanel {
      inset: 0;
      width: 100%;
      height: 100%;
      border-right: 0;
      border-bottom: 0;
      border-left: 0;
      border-radius: 22px 22px 0 0;
      background: #fff;
      box-shadow: 0 -12px 34px rgba(20,20,30,.18);
    }

    .sheetHandle {
      display: block;
    }

    .panelHeader {
      padding: 12px 18px 12px;
    }

    h1 {
      font-size: 18px;
    }

    .stats span:nth-child(1) {
      display: none;
    }

    .selectedDetail {
      gap: 10px;
      padding: 12px 18px;
    }

    .selectedHead {
      grid-template-columns: 44px minmax(0, 1fr) auto;
      gap: 10px;
    }

    .brandLogo {
      width: 44px;
      height: 44px;
      font-size: 14px;
    }

    .brandLogo.brandBadge[data-brand-logo="kfc"] {
      width: 40px;
      height: 40px;
      font-size: 13px;
    }

    .selectedHead p {
      font-size: 15px;
    }

    .selectedHead h2 {
      font-size: 14px;
    }

    .selectedHead strong {
      font-size: 18px;
    }

    .couponFacts {
      display: none;
    }

    .openAppButton {
      min-height: 46px;
      font-size: 15px;
    }

    .reportCouponButton {
      min-height: 40px;
      font-size: 13px;
    }

    .sectionHeader {
      padding: 12px 18px 8px;
    }

    .couponListRow {
      grid-template-columns: 40px minmax(0, 1fr) auto;
      padding: 13px 18px;
    }

    .storeLogo {
      width: 40px;
      height: 40px;
    }

    .couponRowDeal {
      min-width: 64px;
    }

    .couponRowDeal strong {
      font-size: 16px;
    }

    .feedbackOverlay {
      place-items: end center;
      padding: 12px;
      padding-bottom: max(12px, env(safe-area-inset-bottom));
    }

    .feedbackDialog {
      width: 100%;
      max-height: min(86dvh, 640px);
      border-radius: 8px;
      padding: 16px;
    }

    .feedbackHeader h2 {
      font-size: 18px;
    }

    .feedbackActions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .marker:not(.isProjected) {
      left: clamp(16vw, var(--pin-mobile-x), 84vw);
      top: clamp(92px, var(--pin-mobile-y), 42vh);
    }

    .marker {
      max-width: 48vw;
    }

    .pinBubble {
      gap: 5px;
      min-height: 34px;
      padding-right: 9px;
    }

    .pinLogo {
      width: 25px;
      height: 25px;
      font-size: 10px;
    }

    .pinDeal small {
      display: none;
    }

    .pinDeal b {
      font-size: 13px;
    }
  }
`;
