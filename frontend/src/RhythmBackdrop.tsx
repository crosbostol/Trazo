// Abstract lanes and an eight-second ambient breath, not a live biometric reading.
export function RhythmBackdrop() {
  return (
    <div className="rhythm-backdrop" aria-hidden="true">
      <div className="breath-halo" />
      <svg
        className="rhythm-lanes"
        viewBox="0 0 1600 1100"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="lane-light" x1="0" y1="1" x2="1" y2="0">
            <stop stopColor="#91b59c" stopOpacity="0" />
            <stop offset=".5" stopColor="#91b59c" stopOpacity=".28" />
            <stop offset="1" stopColor="#91b59c" stopOpacity=".05" />
          </linearGradient>
        </defs>
        <g fill="none" stroke="url(#lane-light)">
          {Array.from({ length: 7 }, (_, i) => (
            <path
              key={i}
              strokeWidth="1"
              d={`M ${150 + i * 32} 1250 L ${860 + i * 32} 530 C ${1200 + i * 32} ${170 - i * 12}, ${760 + i * 14} ${-200 - i * 15}, ${520 + i * 24} -100`}
            />
          ))}
        </g>
        <path
          className="lane-runner"
          pathLength="100"
          fill="none"
          stroke="#a9c5a3"
          strokeWidth="2"
          strokeLinecap="round"
          d="M 246 1250 L 956 530 C 1296 134, 802 -245, 592 -100"
        />
      </svg>
      <div className="breath-orbit">
        <div className="breath-ring ring-one" />
        <div className="breath-ring ring-two" />
        <div className="breath-ring ring-three" />
        <span className="orbit-point" />
      </div>
      <div className="rhythm-caption">
        <i />
        <span>EN TU PROPIO RITMO</span>
        <span className="rhythm-ticks">Ⅰ Ⅱ Ⅲ Ⅱ Ⅰ</span>
      </div>
    </div>
  );
}
