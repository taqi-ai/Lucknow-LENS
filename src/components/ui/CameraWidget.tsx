import React, { useEffect, useRef } from 'react';
import { CameraController, CAMERA_CONFIG } from '../../city/cameraController';
import { Compass, RotateCcw, Sliders } from 'lucide-react';

interface CameraWidgetProps {
  controller: CameraController | null;
}

export const CameraWidget: React.FC<CameraWidgetProps> = ({ controller }) => {
  const compassDialRef = useRef<HTMLDivElement>(null);
  const headingTextRef = useRef<HTMLSpanElement>(null);
  const tiltTextRef = useRef<HTMLSpanElement>(null);
  const tiltInputRef = useRef<HTMLInputElement>(null);
  const moveRespTextRef = useRef<HTMLSpanElement>(null);
  const moveRespInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<number>();
  const isDraggingCompass = useRef(false);
  const isDraggingTilt = useRef(false);
  const isDraggingMoveResp = useRef(false);

  const zoomRespTextRef = useRef<HTMLSpanElement>(null);
  const zoomRespInputRef = useRef<HTMLInputElement>(null);
  const isDraggingZoomResp = useRef(false);

  useEffect(() => {
    if (!controller) return;

    const updateUI = () => {
      requestRef.current = requestAnimationFrame(updateUI);

      // Safe responsiveness percentages
      const safeMovePct = Number.isFinite(controller.moveResponsiveness) 
        ? Math.max(0, Math.min(100, Math.round(controller.moveResponsiveness)))
        : CAMERA_CONFIG.DEFAULT_RESPONSIVENESS;
        
      const safeZoomPct = Number.isFinite(controller.zoomResponsiveness) 
        ? Math.max(0, Math.min(100, Math.round(controller.zoomResponsiveness)))
        : CAMERA_CONFIG.DEFAULT_RESPONSIVENESS;

      // Tilt input sync
      if (!isDraggingTilt.current && tiltInputRef.current) {
        if (Number.isFinite(controller.pitch)) {
          tiltInputRef.current.value = controller.pitch.toString();
        }
      }

      // Move responsiveness sync
      if (!isDraggingMoveResp.current && moveRespInputRef.current) {
        moveRespInputRef.current.value = safeMovePct.toString();
      }

      // Zoom responsiveness sync
      if (!isDraggingZoomResp.current && zoomRespInputRef.current) {
        zoomRespInputRef.current.value = safeZoomPct.toString();
      }

      // Continuous rotation degree for smooth unlimited dial spinning
      const continuousDeg = Number.isFinite(controller.azimuth) 
        ? (controller.azimuth * 180) / Math.PI 
        : 0;

      // Normalized display heading (0° - 359°) for numerical readout
      let headingDeg = (360 - (continuousDeg % 360) + 360) % 360;
      if (!Number.isFinite(headingDeg)) headingDeg = 0;

      if (compassDialRef.current && !isDraggingCompass.current) {
        compassDialRef.current.style.transform = `rotate(${continuousDeg}deg)`;
      }

      if (headingTextRef.current) {
        headingTextRef.current.textContent = `${Math.round(headingDeg)}°`;
      }
      
      if (tiltTextRef.current) {
        const tiltDeg = Number.isFinite(controller.pitch)
          ? Math.round((controller.pitch * 180) / Math.PI)
          : 45;
        tiltTextRef.current.textContent = `${tiltDeg}°`;
      }

      if (moveRespTextRef.current) {
        moveRespTextRef.current.textContent = `${safeMovePct}%`;
      }
      if (zoomRespTextRef.current) {
        zoomRespTextRef.current.textContent = `${safeZoomPct}%`;
      }
    };

    requestRef.current = requestAnimationFrame(updateUI);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [controller]);

  // Handle Compass Dragging (Continuous unwrapped relative deltas)
  const handleCompassPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!controller) return;
    isDraggingCompass.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let lastAngle = Math.atan2(e.clientY - cy, e.clientX - cx);

    const onPointerMove = (eMove: PointerEvent) => {
      const currentAngle = Math.atan2(eMove.clientY - cy, eMove.clientX - cx);
      let delta = currentAngle - lastAngle;

      // Unwrap boundary crossings at +/- Math.PI to eliminate jumps
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;

      lastAngle = currentAngle;

      if (Number.isFinite(delta)) {
        // Clockwise drag turns camera right (decreases azimuth). 1:1 mapping for UI dial.
        controller.addAzimuthDelta(-delta);
      }

      // Update visual dial transform continuously to destAzimuth for instant 1:1 feedback
      const targetDeg = Number.isFinite(controller.destAzimuth) ? (controller.destAzimuth * 180) / Math.PI : 0;
      if (compassDialRef.current) {
        compassDialRef.current.style.transform = `rotate(${targetDeg}deg)`;
      }
    };

    const onPointerUp = () => {
      isDraggingCompass.current = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleTiltChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!controller) return;
    const val = parseFloat(e.target.value);
    if (Number.isFinite(val)) {
      controller.setPitch(val);
    }
  };

  const handleMoveRespChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!controller) return;
    const val = parseInt(e.target.value, 10);
    const safeVal = Number.isFinite(val) ? val : CAMERA_CONFIG.DEFAULT_RESPONSIVENESS;
    controller.setMoveResponsiveness(safeVal);
  };

  const handleZoomRespChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!controller) return;
    const val = parseInt(e.target.value, 10);
    const safeVal = Number.isFinite(val) ? val : CAMERA_CONFIG.DEFAULT_RESPONSIVENESS;
    controller.setZoomResponsiveness(safeVal);
  };

  const resetHeading = () => {
    if (controller) controller.resetHeading();
  };

  if (!controller) return null;

  const tiltMin = CAMERA_CONFIG.MIN_PITCH;
  const tiltMax = CAMERA_CONFIG.MAX_PITCH;
  const initialMovePct = Number.isFinite(controller.moveResponsiveness) 
    ? Math.round(controller.moveResponsiveness) 
    : CAMERA_CONFIG.DEFAULT_RESPONSIVENESS;

  const initialZoomPct = Number.isFinite(controller.zoomResponsiveness) 
    ? Math.round(controller.zoomResponsiveness) 
    : CAMERA_CONFIG.DEFAULT_RESPONSIVENESS;

  return (
    <div className="absolute right-4 bottom-4 z-30 pointer-events-none">
      <div 
        className="pointer-events-auto bg-slate-900/90 border border-slate-700/80 backdrop-blur-xl rounded-2xl p-3 shadow-2xl flex flex-col items-center gap-2.5 w-36 select-none"
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] font-extrabold tracking-widest text-slate-400 uppercase flex items-center gap-1 w-full justify-center">
          <Compass className="w-3 h-3 text-amber-500" /> CAMERA
        </div>

        {/* Compass Dial */}
        <div className="relative w-16 h-16 flex items-center justify-center mt-0.5">
          {/* North indicator on housing */}
          <div className="absolute top-[-4px] w-1 h-2 bg-amber-500 rounded-full z-10" />
          
          <div 
            className="w-16 h-16 rounded-full border border-slate-600/50 bg-slate-800/80 cursor-grab active:cursor-grabbing flex items-center justify-center relative shadow-inner touch-none"
            onPointerDown={handleCompassPointerDown}
            ref={compassDialRef}
          >
            {/* Compass markings */}
            <span className="absolute top-1 text-[9px] font-bold text-amber-400">N</span>
            <span className="absolute right-1 text-[9px] font-bold text-slate-400">E</span>
            <span className="absolute bottom-1 text-[9px] font-bold text-slate-400">S</span>
            <span className="absolute left-1 text-[9px] font-bold text-slate-400">W</span>
            {/* Center Pivot */}
            <div className="w-1.5 h-1.5 bg-slate-500 rounded-full" />
          </div>
          
          {/* Quick reset button */}
          <button 
            className="absolute z-10 w-6 h-6 flex items-center justify-center rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-600/50 shadow-md"
            onClick={resetHeading}
            title="Reset to North"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>

        <div className="text-center w-full mt-[-2px]">
          <span className="text-[9px] text-slate-500 font-semibold block">HEADING</span>
          <span className="text-xs font-bold text-slate-200" ref={headingTextRef}>0°</span>
        </div>

        <div className="w-full border-t border-slate-700/80 my-0.5" />

        {/* Tilt Slider */}
        <div className="w-full flex flex-col items-center gap-0.5">
          <span className="text-[9px] text-slate-400 font-semibold flex justify-between w-full px-0.5">
            <span>TILT</span>
            <span ref={tiltTextRef} className="text-amber-400 font-bold">45°</span>
          </span>
          <input
            ref={tiltInputRef}
            type="range"
            min={tiltMin}
            max={tiltMax}
            step={0.01}
            defaultValue={controller.pitch}
            onChange={handleTiltChange}
            onPointerDown={() => { isDraggingTilt.current = true; }}
            onPointerUp={() => { isDraggingTilt.current = false; }}
            onPointerLeave={() => { isDraggingTilt.current = false; }}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
        </div>

        <div className="w-full border-t border-slate-700/80 my-0.5" />

        {/* MOVE RESPONSIVENESS */}
        <div className="w-full flex flex-col items-center gap-0.5">
          <span className="text-[9px] text-slate-400 font-semibold flex justify-between w-full px-0.5 items-center">
            <span className="flex items-center gap-0.5">
              <Sliders className="w-2.5 h-2.5 text-sky-400" /> MOVE SENS.
            </span>
            <span ref={moveRespTextRef} className="text-sky-400 font-bold">{initialMovePct}%</span>
          </span>
          <input
            ref={moveRespInputRef}
            type="range"
            min={0}
            max={100}
            step={1}
            defaultValue={initialMovePct}
            onChange={handleMoveRespChange}
            onPointerDown={() => { isDraggingMoveResp.current = true; }}
            onPointerUp={() => { isDraggingMoveResp.current = false; }}
            onPointerLeave={() => { isDraggingMoveResp.current = false; }}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-400"
          />
        </div>

        {/* ZOOM RESPONSIVENESS */}
        <div className="w-full flex flex-col items-center gap-0.5 mt-1">
          <span className="text-[9px] text-slate-400 font-semibold flex justify-between w-full px-0.5 items-center">
            <span className="flex items-center gap-0.5">
              <Sliders className="w-2.5 h-2.5 text-emerald-400" /> ZOOM SENS.
            </span>
            <span ref={zoomRespTextRef} className="text-emerald-400 font-bold">{initialZoomPct}%</span>
          </span>
          <input
            ref={zoomRespInputRef}
            type="range"
            min={0}
            max={100}
            step={1}
            defaultValue={initialZoomPct}
            onChange={handleZoomRespChange}
            onPointerDown={() => { isDraggingZoomResp.current = true; }}
            onPointerUp={() => { isDraggingZoomResp.current = false; }}
            onPointerLeave={() => { isDraggingZoomResp.current = false; }}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-400"
          />
        </div>
        
        <div className="flex justify-between w-full text-[8px] text-slate-500 font-mono px-0.5 mt-0.5">
          <span>SLOW</span>
          <span>FAST</span>
        </div>
      </div>
    </div>
  );
};


