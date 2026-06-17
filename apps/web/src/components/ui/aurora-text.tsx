"use client";

import React, { memo } from "react";

interface AuroraTextProps {
  children: React.ReactNode;
  className?: string;
  colors?: string[];
  speed?: number;
}

export const AuroraText = memo(
  ({
    children,
    className = "",
    colors = ["#FF0080", "#7928CA", "#0070F3", "#38bdf8"],
    speed = 1,
  }: AuroraTextProps) => {
    const gradientStyle = {
      backgroundImage: `linear-gradient(135deg, ${colors.join(", ")}, ${
        colors[0]
      })`,
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      animation: `aurora ${10 / speed}s ease-in-out infinite alternate`,
      backgroundSize: "200% auto",
    };

    return (
      <span className={`relative inline-block ${className}`.trim()}>
        <span className="sr-only">{children}</span>
        <span aria-hidden="true" className="relative" style={gradientStyle}>
          {children}
        </span>
      </span>
    );
  },
);

AuroraText.displayName = "AuroraText";
