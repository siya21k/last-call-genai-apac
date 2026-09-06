import React from 'react';

interface MascotFlowerProps {
  className?: string;
  size?: number;
  mood?: 'happy' | 'winking' | 'celebrating' | 'sleepy';
  message?: string;
}

export const MascotFlower: React.FC<MascotFlowerProps> = ({
  className = '',
  size = 64,
  mood = 'happy',
  message,
}) => {
  return (
    <div className={`inline-flex flex-col items-center select-none ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="filter drop-shadow-[2px_2px_0px_#2d2825]"
      >
        {/* Petals */}
        {/* Top */}
        <circle cx="50" cy="22" r="15" fill="#fca5b0" stroke="#2d2825" strokeWidth="3" />
        {/* Top Right */}
        <circle cx="74" cy="35" r="15" fill="#ff8575" stroke="#2d2825" strokeWidth="3" />
        {/* Bottom Right */}
        <circle cx="70" cy="65" r="15" fill="#fca5b0" stroke="#2d2825" strokeWidth="3" />
        {/* Bottom */}
        <circle cx="50" cy="78" r="15" fill="#ff8575" stroke="#2d2825" strokeWidth="3" />
        {/* Bottom Left */}
        <circle cx="30" cy="65" r="15" fill="#fca5b0" stroke="#2d2825" strokeWidth="3" />
        {/* Top Left */}
        <circle cx="26" cy="35" r="15" fill="#ff8575" stroke="#2d2825" strokeWidth="3" />

        {/* Center Disk */}
        <circle cx="50" cy="50" r="22" fill="#f5b638" stroke="#2d2825" strokeWidth="3" />

        {/* Rosy Cheeks */}
        <ellipse cx="38" cy="54" rx="4" ry="2.5" fill="#ff7865" opacity="0.8" />
        <ellipse cx="62" cy="54" rx="4" ry="2.5" fill="#ff7865" opacity="0.8" />

        {/* Eyes */}
        {mood === 'winking' ? (
          <>
            {/* Left eye open */}
            <circle cx="41" cy="46" r="2.5" fill="#2d2825" />
            <circle cx="42" cy="45" r="0.9" fill="#ffffff" />
            {/* Right eye wink */}
            <path
              d="M 57 46 Q 61 43 65 46"
              stroke="#2d2825"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          </>
        ) : mood === 'sleepy' ? (
          <>
            <path
              d="M 37 47 Q 41 50 45 47"
              stroke="#2d2825"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M 55 47 Q 59 50 63 47"
              stroke="#2d2825"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
            />
          </>
        ) : (
          <>
            {/* Open Friendly Eyes */}
            <circle cx="41" cy="46" r="2.8" fill="#2d2825" />
            <circle cx="42" cy="44.8" r="1" fill="#ffffff" />
            <circle cx="59" cy="46" r="2.8" fill="#2d2825" />
            <circle cx="60" cy="44.8" r="1" fill="#ffffff" />
          </>
        )}

        {/* Smiling Mouth */}
        {mood === 'celebrating' ? (
          <path
            d="M 44 54 Q 50 63 56 54 Z"
            fill="#2d2825"
            stroke="#2d2825"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M 44 53 Q 50 60 56 53"
            stroke="#2d2825"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        )}
      </svg>

      {message && (
        <span className="mt-1 text-xs font-bold text-[#2d2825] bg-[#fffcf4] border-2 border-[#2d2825] px-2.5 py-1 rounded-full shadow-[2px_2px_0px_#2d2825] text-center max-w-xs">
          {message}
        </span>
      )}
    </div>
  );
};

export type RewardType = 'flower' | 'star' | 'heart' | 'sprout';

export const getRandomRewardType = (): RewardType => {
  const types: RewardType[] = ['flower', 'star', 'heart', 'sprout'];
  const idx = Math.floor(Math.random() * types.length);
  return types[idx];
};

export const CompletionRewardIcon: React.FC<{
  type?: RewardType;
  size?: number;
  className?: string;
}> = ({ type = 'flower', size = 32, className = '' }) => {
  if (type === 'star') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 60 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`filter drop-shadow-[2px_2px_0px_#2d2825] animate-in zoom-in-75 duration-200 ${className}`}
      >
        <path
          d="M 30 5 L 37 20 L 53 23 L 42 35 L 45 51 L 30 43 L 15 51 L 18 35 L 7 23 L 23 20 Z"
          fill="#f5b638"
          stroke="#2d2825"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {/* Rosy cheeks & happy eyes */}
        <circle cx="25" cy="30" r="1.8" fill="#2d2825" />
        <circle cx="35" cy="30" r="1.8" fill="#2d2825" />
        <path
          d="M 27 34 Q 30 38 33 34"
          stroke="#2d2825"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="21" cy="33" r="2" fill="#ff7865" opacity="0.8" />
        <circle cx="39" cy="33" r="2" fill="#ff7865" opacity="0.8" />
      </svg>
    );
  }

  if (type === 'heart') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 60 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`filter drop-shadow-[2px_2px_0px_#2d2825] animate-in zoom-in-75 duration-200 ${className}`}
      >
        <path
          d="M 30 48 C 15 36 8 26 8 18 C 8 11 14 6 22 6 C 26.5 6 30 9 30 9 C 30 9 33.5 6 38 6 C 46 6 52 11 52 18 C 52 26 45 36 30 48 Z"
          fill="#ff7865"
          stroke="#2d2825"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {/* Soft highlight & cute smile */}
        <path
          d="M 16 14 C 18 10 23 9 25 10"
          stroke="#ffffff"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="24" cy="22" r="1.8" fill="#2d2825" />
        <circle cx="36" cy="22" r="1.8" fill="#2d2825" />
        <path
          d="M 27 26 Q 30 30 33 26"
          stroke="#2d2825"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }

  if (type === 'sprout') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 60 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`filter drop-shadow-[2px_2px_0px_#2d2825] animate-in zoom-in-75 duration-200 ${className}`}
      >
        {/* Stem */}
        <path
          d="M 30 52 L 30 28"
          stroke="#2d2825"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        {/* Left Leaf */}
        <path
          d="M 30 34 C 18 34 14 20 28 20 C 30 24 30 30 30 34 Z"
          fill="#52b7aa"
          stroke="#2d2825"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {/* Right Leaf */}
        <path
          d="M 30 28 C 42 28 46 14 32 14 C 30 18 30 24 30 28 Z"
          fill="#52b7aa"
          stroke="#2d2825"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <circle cx="24" cy="26" r="1.5" fill="#2d2825" />
        <circle cx="36" cy="20" r="1.5" fill="#2d2825" />
      </svg>
    );
  }

  // Default Flower
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 60 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`filter drop-shadow-[2px_2px_0px_#2d2825] animate-in zoom-in-75 duration-200 ${className}`}
    >
      <circle cx="30" cy="14" r="9" fill="#fca5b0" stroke="#2d2825" strokeWidth="2.5" />
      <circle cx="44" cy="22" r="9" fill="#ff8575" stroke="#2d2825" strokeWidth="2.5" />
      <circle cx="42" cy="38" r="9" fill="#fca5b0" stroke="#2d2825" strokeWidth="2.5" />
      <circle cx="30" cy="46" r="9" fill="#ff8575" stroke="#2d2825" strokeWidth="2.5" />
      <circle cx="18" cy="38" r="9" fill="#fca5b0" stroke="#2d2825" strokeWidth="2.5" />
      <circle cx="16" cy="22" r="9" fill="#ff8575" stroke="#2d2825" strokeWidth="2.5" />
      <circle cx="30" cy="30" r="13" fill="#f5b638" stroke="#2d2825" strokeWidth="2.5" />
      {/* Eyes & Smile */}
      <circle cx="25" cy="28" r="1.8" fill="#2d2825" />
      <circle cx="35" cy="28" r="1.8" fill="#2d2825" />
      <path
        d="M 27 32 Q 30 36 33 32"
        stroke="#2d2825"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="22" cy="31" r="1.5" fill="#ff7865" />
      <circle cx="38" cy="31" r="1.5" fill="#ff7865" />
    </svg>
  );
};

export const DecorativeSparkle: React.FC<{
  className?: string;
  size?: number;
  color?: string;
}> = ({ className = '', size = 16, color = '#f5b638' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`pointer-events-none select-none opacity-40 hover:opacity-80 transition-opacity ${className}`}
    >
      <path
        d="M 12 0 C 12 7 17 12 24 12 C 17 12 12 17 12 24 C 12 17 7 12 0 12 C 7 12 12 7 12 0 Z"
        fill={color}
        stroke="#2d2825"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
};
