import React, { useRef, useState, useEffect } from 'react';

export default function SignatureCanvas({ onSave, width = 400, height = 200 }) {
  const canvasRef = useRef(null);
  const [ctx, setCtx] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      const c = canvasRef.current.getContext('2d');
      c.strokeStyle = '#1f2937';
      c.lineWidth = 2;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      setCtx(c);
    }
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  };

  const startDraw = (e) => {
    e.preventDefault();
    setDrawing(true);
    setHasSigned(true);
    const { x, y } = getPos(e.touches ? e.touches[0] : e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const { x, y } = getPos(e.touches ? e.touches[0] : e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDraw = () => { setDrawing(false); };

  const clear = () => {
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      setHasSigned(false);
    }
  };

  const save = () => {
    if (canvasRef.current) {
      return canvasRef.current.toDataURL('image/png');
    }
    return null;
  };

  return (
    <div style={styles.container}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
        style={{ ...styles.canvas, border: '1px solid #d1d5db', borderRadius: '8px', cursor: 'crosshair', backgroundColor: '#fefefe' }}
      />
      <div style={styles.hint}>Draw your signature here</div>
    </div>
  );
}

const styles = {
  container: { position: 'relative', display: 'inline-block' },
  canvas: { display: 'block' },
  hint: { fontSize: '12px', color: '#9ca3af', marginTop: '4px', textAlign: 'center' },
};
