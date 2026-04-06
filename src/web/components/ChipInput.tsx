import React, { useRef, useState, type KeyboardEvent } from 'react';

interface ChipInputProps {
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  label: string;
  name: string;
  disabled?: boolean;
  suggestions?: string[];
}

const ChipInput: React.FC<ChipInputProps> = ({ value, onChange, placeholder, label, name, disabled, suggestions = [] }) => {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputId = `chip-input-${name}`;
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredSuggestions = suggestions.filter(
    (s) => !value.includes(s) && s.toLowerCase().includes(inputValue.toLowerCase())
  );

  const addChip = (chip: string) => {
    const trimmed = chip.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInputValue('');
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
      e.preventDefault();
      addChip(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      onChange(value.slice(0, -1));
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const newValue = e.target.value;
    if (newValue.endsWith(',')) {
      const chipValue = newValue.slice(0, -1).trim();
      if (chipValue && !value.includes(chipValue)) {
        onChange([...value, chipValue]);
        setInputValue('');
      } else {
        setInputValue('');
      }
      setShowSuggestions(false);
    } else {
      setInputValue(newValue);
      setShowSuggestions(newValue.length > 0 || suggestions.length > 0);
    }
  };

  const handleInputFocus = () => {
    if (!disabled && suggestions.length > 0) setShowSuggestions(true);
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Hide suggestions only if focus leaves the container
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setShowSuggestions(false);
    }
  };

  const removeChip = (index: number) => {
    if (disabled) return;
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="w-full relative" ref={containerRef} onBlur={handleBlur}>
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 transition-colors duration-200">
        {label}
      </label>
      <div className={`relative w-full min-h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-md focus-within:ring-2 focus-within:ring-blue-500 dark:focus-within:ring-blue-400 focus-within:border-transparent transition-colors duration-200 pr-2 ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}>
        <div className="flex flex-wrap gap-2 items-center w-full">
          {value.map((item, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-sm bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 rounded-md flex-shrink-0 min-w-0 max-w-full transition-colors duration-200"
            >
              <span className="truncate max-w-[16rem] sm:max-w-[20rem] md:max-w-[24rem]">{item}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeChip(index)}
                  className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-sm p-0.5 transition-colors duration-200"
                  aria-label={`Remove ${item}`}
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              )}
            </span>
          ))}
          <input
            id={inputId}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleInputFocus}
            placeholder={value.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[2ch] outline-none text-sm bg-transparent text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            disabled={disabled}
            autoComplete="off"
          />
        </div>
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg">
          {filteredSuggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); addChip(s); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ChipInput;
