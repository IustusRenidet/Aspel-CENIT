import * as React from "react";
const SVGComponent = (props) => (
  <svg
    width={500}
    height={500}
    viewBox="0 0 500 500"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <rect width={500} height={500} fill="#0F172A" rx={30} />
    <defs>
      <linearGradient id="mainBeam" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop
          offset="0%"
          style={{
            stopColor: "#7067f0",
            stopOpacity: 0.9,
          }}
        />
        <stop
          offset="50%"
          style={{
            stopColor: "#8B7FF5",
            stopOpacity: 1,
          }}
        />
        <stop
          offset="100%"
          style={{
            stopColor: "#F2C94C",
            stopOpacity: 1,
          }}
        />
      </linearGradient>
      <linearGradient id="gradAscension" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop
          offset="0%"
          style={{
            stopColor: "#7067f0",
            stopOpacity: 0.8,
          }}
        />
        <stop
          offset="100%"
          style={{
            stopColor: "#F2C94C",
            stopOpacity: 1,
          }}
        />
      </linearGradient>
      <linearGradient id="sideBeam" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop
          offset="0%"
          style={{
            stopColor: "#7067f0",
            stopOpacity: 0.6,
          }}
        />
        <stop
          offset="100%"
          style={{
            stopColor: "#CAF0F8",
            stopOpacity: 0.3,
          }}
        />
      </linearGradient>
      <filter id="starGlow" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation={6} result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
      <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation={3} result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <g transform="translate(0,56)">
      <circle cx={250} cy={250} r={180} fill="#7067f0" opacity={0.08} />
      <circle
        cx={250}
        cy={120}
        r={140}
        fill="none"
        stroke="#CAF0F8"
        strokeWidth={1}
        opacity={0.15}
        strokeDasharray="5 8"
      />
      <circle
        cx={250}
        cy={120}
        r={100}
        fill="none"
        stroke="#7067f0"
        strokeWidth={1}
        opacity={0.1}
      />
      <g>
        <path
          d="M150 380 L250 100 L350 380 Z"
          fill="url(#sideBeam)"
          opacity={0.6}
        />
        <path
          d="M150 380 L250 100 L350 380 Z"
          fill="url(#sideBeam)"
          opacity={0.6}
        />
        <path
          d="M150 380 L250 100 L350 380 Z"
          fill="url(#gradAscension)"
          opacity={0.85}
        />
        <path
          d="M150 380 L250 90 L350 380 Z"
          stroke="#CAF0F8"
          strokeWidth={2}
          fill="none"
          opacity={0.4}
        />
        <line
          x1={250}
          y1={90}
          x2={250}
          y2={380}
          stroke="#D4AF37"
          strokeWidth={1.5}
          opacity={0.6}
        />
        <path
          d="M200 320 L250 180 L300 320"
          stroke="#CAF0F8"
          strokeWidth={1}
          fill="none"
          opacity={0.2}
        />
      </g>
      <line
        x1={150}
        y1={385}
        x2={350}
        y2={385}
        stroke="#CAF0F8"
        strokeWidth={3}
        opacity={0.7}
        filter="url(#softGlow)"
      />
      <g transform="translate(250, 60)">
        <circle r={35} fill="#F2C94C" opacity={0.15} filter="url(#starGlow)" />
        <circle r={25} fill="#F2C94C" opacity={0.25} filter="url(#starGlow)">
          <animate
            attributeName="r"
            values="25;30;25"
            dur="4s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.25;0.4;0.25"
            dur="4s"
            repeatCount="indefinite"
          />
        </circle>
        <path
          d="M0 -18 L5 -5 L18 0 L5 5 L0 18 L-5 5 L-18 0 L-5 -5 Z"
          fill="#F2C94C"
          filter="url(#starGlow)"
        />
        <path
          d="M0 -13 L4 -4 L13 0 L4 4 L0 13 L-4 4 L-13 0 L-4 -4 Z"
          fill="#FFFFFF"
          opacity={0.9}
        />
        <circle r={4} fill="#FFFFFF" opacity={0.9}>
          <animate
            attributeName="opacity"
            values="0.9;1;0.9"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
        <circle r={18} fill="#CAF0F8" opacity={0.8}>
          <animate
            attributeName="opacity"
            values=".1;.8;0.1"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
      </g>
      <g transform="translate(250, 60)" opacity={0.3}>
        <rect
          x={-40}
          y={-40}
          width={80}
          height={80}
          fill="none"
          stroke="#D4AF37"
          strokeWidth={1}
          transform="rotate(45)"
        />
        <rect
          x={-40}
          y={-40}
          width={80}
          height={80}
          fill="none"
          stroke="#D4AF37"
          strokeWidth={1}
        />
      </g>
    </g>
  </svg>
);
export default SVGComponent;
