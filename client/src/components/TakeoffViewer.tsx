import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ZoomIn, ZoomOut, Maximize, Download, Eye, EyeOff, 
  ChevronLeft, ChevronRight, Loader2 
} from "lucide-react";

interface TakeoffViewerProps {
  /** URL of the PDF file to display as background */
  pdfUrl: string;
  /** SVG overlay string from the takeoff */
  svgOverlay: string;
  /** Symbol counts for the summary bar */
  counts: Record<string, number>;
  /** Colour/style mapping for symbols */
  symbolStyles: Record<string, { colour: string; shape: string; radius: number }>;
  /** Human-readable descriptions */
  symbolDescriptions: Record<string, string>;
  /** Drawing reference */
  drawingRef: string;
  /** Whether takeoff has been verified */
  isVerified?: boolean;
}

export default function TakeoffViewer({
  pdfUrl,
  svgOverlay,
  counts,
  symbolStyles,
  symbolDescriptions,
  drawingRef,
  isVerified = false,
}: TakeoffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [showOverlay, setShowOverlay] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.25, 4));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.25, 0.25));
  const handleFit = () => { setZoom(1); setPosition({ x: 0, y: 0 }); };

  // Pan handling
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left click only
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Scroll to zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.max(0.25, Math.min(4, z + delta)));
  };

  const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Drawing Viewer
              {isVerified && (
                <Badge className="bg-green-100 text-green-800 text-xs">Verified</Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{drawingRef}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomOut} title="Zoom out">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomIn} title="Zoom in">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleFit} title="Fit to view">
              <Maximize className="h-4 w-4" />
            </Button>
            <Button 
              variant={showOverlay ? "default" : "outline"} 
              size="sm" 
              className="h-8 text-xs ml-2"
              onClick={() => setShowOverlay(!showOverlay)}
            >
              {showOverlay ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
              {showOverlay ? 'Overlay On' : 'Overlay Off'}
            </Button>
          </div>
        </div>
        
        {/* Counts summary bar */}
        <div className="flex flex-wrap gap-2 mt-2">
          {Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => {
            const style = symbolStyles[code];
            return (
              <div 
                key={code}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ 
                  backgroundColor: style ? `${style.colour}15` : '#f3f4f6',
                  color: style?.colour || '#666',
                  border: `1px solid ${style?.colour || '#ddd'}40`,
                }}
              >
                <span 
                  className="w-2.5 h-2.5 rounded-full" 
                  style={{ backgroundColor: style?.colour || '#888' }}
                />
                {code}: {count}
              </div>
            );
          })}
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
            Total: {totalItems}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 overflow-hidden p-0">
        {/* PDF + SVG overlay container */}
        <div 
          ref={containerRef}
          className="relative w-full h-full overflow-hidden bg-gray-200 cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <div 
            className="absolute"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
            }}
          >
            {/* PDF rendered as image (using the file URL) */}
            <div className="relative">
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              )}
              
              {/* PDF as embedded object or image */}
              <img 
                src={pdfUrl}
                alt={`Drawing: ${drawingRef}`}
                className="max-w-none"
                onLoad={() => setIsLoading(false)}
                onError={() => setIsLoading(false)}
                draggable={false}
              />
              
              {/* SVG overlay */}
              {showOverlay && svgOverlay && (
                <div 
                  className="absolute inset-0"
                  dangerouslySetInnerHTML={{ __html: svgOverlay }}
                />
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
