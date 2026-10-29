import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';

/** Draw-to-sign pad. Produces a small PNG data URL with a transparent background. */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111111';
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div>
      <canvas
        ref={canvas}
        className="h-40 w-full touch-none rounded-xl border border-dashed border-line-strong bg-white"
        aria-label="Signature area. Draw your signature with a finger, stylus or mouse."
        onPointerDown={(e) => {
          drawing.current = true;
          canvas.current!.setPointerCapture(e.pointerId);
          const ctx = canvas.current!.getContext('2d')!;
          const p = point(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = canvas.current!.getContext('2d')!;
          const p = point(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          setEmpty(false);
          onChange(canvas.current!.toDataURL('image/png'));
        }}
      />
      <div className="mt-2 flex items-center justify-between text-xs text-ink-3">
        <span>{empty ? 'Sign in the box above' : 'Signature captured'}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const c = canvas.current!;
            c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
            setEmpty(true);
            onChange(null);
          }}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
