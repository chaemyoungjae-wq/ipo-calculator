import { CloseIcon, SearchIcon } from "./icons";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** 지우기 버튼을 누를 때 추가로 할 일 (검색창 닫기 등) */
  onClear?: () => void;
}

/** 오른쪽에 돋보기, 입력 중에는 지우기 버튼이 있는 검색칸. */
export function SearchField({ value, onChange, placeholder = "기업명 검색", autoFocus, onClear }: Props) {
  return (
    <div className="search-field">
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        enterKeyHint="search"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // 한글 조합 중에 누른 Enter는 글자 확정용이라 건드리지 않는다.
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            // 입력할 때마다 이미 걸러지므로, Enter는 휴대폰 키패드를 닫는 데만 쓴다.
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            onChange("");
            onClear?.();
          }
        }}
      />
      {value || onClear ? (
        <button
          className="search-btn"
          aria-label="검색어 지우기"
          onClick={() => {
            onChange("");
            onClear?.();
          }}
        >
          <CloseIcon size={16} />
        </button>
      ) : (
        <span className="search-btn" aria-hidden="true">
          <SearchIcon />
        </span>
      )}
    </div>
  );
}
