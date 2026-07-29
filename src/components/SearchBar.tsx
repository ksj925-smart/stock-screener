import type { Ref } from "react";

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  /** 입력창 DOM 참조. 필터 조작 시 상위에서 blur()로 키보드를 내리기 위해 쓴다. */
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * 개별 종목 검색 입력창 (SPEC v1.2).
 * TDS SearchField는 라이트 테마라 앱의 다크 디자인과 충돌하므로,
 * SortSheet와 동일하게 앱 CSS 토큰으로 직접 구현한다.
 */
export function SearchBar({ value, onChange, inputRef }: SearchBarProps) {
  return (
    <div className="searchbar">
      <span className="searchbar-ic" aria-hidden="true">
        ⌕
      </span>
      <input
        ref={inputRef}
        type="search"
        className="searchbar-in"
        value={value}
        placeholder="종목명 또는 코드 검색"
        aria-label="종목명 또는 코드 검색"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          className="searchbar-x"
          aria-label="검색어 지우기"
          onClick={() => onChange("")}
        >
          ✕
        </button>
      )}
    </div>
  );
}
