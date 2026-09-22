import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';

const SignatureCanvas = forwardRef(function SignatureCanvas({ onChange, onSave, width = 600, height = 240 }, ref) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const drawingRef = useRef(false);
  const hasSignedRef = useRef(false);
  const [hasSigned, setHasSigned] = useState(false);
  const hintId = useId();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.strokeStyle = 'currentColor';
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    contextRef.current = context;
  }, []);

  const getPos = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] || event.changedTouches?.[0] || event;
    return {
      x: ((source.clientX - rect.left) / rect.width) * canvas.width,
      y: ((source.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDraw = (event) => {
    event.preventDefault();
    const context = contextRef.current;
    if (!context) return;
    drawingRef.current = true;
    hasSignedRef.current = true;
    setHasSigned(true);
    const { x, y } = getPos(event);
    context.beginPath();
    context.moveTo(x, y);
  };

  const draw = (event) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const context = contextRef.current;
    if (!context) return;
    const { x, y } = getPos(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const stopDraw = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const data = save();
    onSave?.(data);
    onChange?.(data);
  };

  const save = () => {
    if (!canvasRef.current || !hasSignedRef.current) return null;
    return canvasRef.current.toDataURL('image/png');
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawingRef.current = false;
    hasSignedRef.current = false;
    setHasSigned(false);
    onSave?.(null);
    onChange?.(null);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      clear();
    }
  };

  useImperativeHandle(ref, () => ({ clear, getData: save, isEmpty: () => !hasSignedRef.current }), []);

  return (
    <div className="signature-canvas">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="signature-canvas__pad"
        role="img"
        aria-label="Signature pad. Use a mouse, stylus, or touch to draw your signature."
        aria-describedby={hintId}
        aria-keyshortcuts="Delete Backspace"
        tabIndex="0"
        onKeyDown={handleKeyDown}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
        onTouchCancel={stopDraw}
      />
      <div className="signature-canvas__controls">
        <span className="field-hint" id={hintId}>{hasSigned ? 'Signature captured' : 'Draw your signature here'}</span>
        <button className="button button--secondary button--small" type="button" onClick={clear} disabled={!hasSigned}>Clear</button>
      </div>
    </div>
  );
});

export default SignatureCanvas;
