import React, { useState, useRef, useEffect } from 'react';

interface PlotData {
  axes: Array<{
    label: string;
    positive: string;
    negative: string;
  }>;
  data: Array<{
    id: string;
    author: string;
    emoji: string;
    text: string;
    estimation: string;
    coords: number[];
    replies_to?: string;
    color?: string;
  }>;
}

interface PlotVisualizerProps {
  initialData?: PlotData | null;
}

const PlotVisualizer = ({ initialData = null }: PlotVisualizerProps) => {
  const [jsonInput, setJsonInput] = useState('');
  const [plotData, setPlotData] = useState<PlotData | null>(initialData);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);
  const [showTrajectory, setShowTrajectory] = useState(false);
  const [smoothTrajectory, setSmoothTrajectory] = useState(true);
  const [error, setError] = useState('');
  const [tooltipPos, setTooltipPos] = useState({ x: 50, y: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [timelineDepth, setTimelineDepth] = useState(0);
  const [maxDepth, setMaxDepth] = useState(0);
  const [selectedAxes, setSelectedAxes] = useState({ x: 0, y: 1 });
  const [axisDirections, setAxisDirections] = useState({ x: 1, y: 1 });
  const [showAxisPicker, setShowAxisPicker] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 900 });
  const svgRef = useRef(null);

  const COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788'
  ];

  useEffect(() => {
    const savedPos = localStorage.getItem('tooltipPosition');
    if (savedPos) {
      setTooltipPos(JSON.parse(savedPos));
    }
  }, []);

  // Debug: Log dimensions when they change
  useEffect(() => {
    console.log('Graph dimensions:', dimensions);
  }, [dimensions]);
  useEffect(() => {
    const updateDimensions = () => {
      // Calculate available space more accurately
      const availableWidth = window.innerWidth - 400; // Account for chat sidebar (384px + padding)
      const availableHeight = window.innerHeight - 80; // Account for controls and legend
      
      // Make it square and use as much space as possible
      const size = Math.min(availableWidth, availableHeight);
      setDimensions({ width: size, height: size });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Update plot data when initialData changes
  useEffect(() => {
    if (initialData) {
      // Handle the case where data might be nested or a JSON string
      let plotDataToUse = initialData;
      
      // If the data has a nested structure with a 'data' property that's a JSON string
      if (initialData.data && typeof initialData.data === 'string') {
        try {
          plotDataToUse = JSON.parse(initialData.data);
        } catch (e) {
          console.error('Error parsing nested data:', e);
          setError('Invalid data format');
          return;
        }
      }
      
      // If the data has a nested structure with a 'data' property that's an object
      if (initialData.data && typeof initialData.data === 'object' && !Array.isArray(initialData.data)) {
        plotDataToUse = initialData.data;
      }
      
      setPlotData(plotDataToUse);
      
      if (plotDataToUse.data && Array.isArray(plotDataToUse.data)) {
        const depths = plotDataToUse.data.map(node => getNodeDepth(node, plotDataToUse.data));
        const max = Math.max(...depths);
        setMaxDepth(max);
        setTimelineDepth(max);
        
        setSelectedAxes({ x: 0, y: 1 });
        setAxisDirections({ x: 1, y: 1 });
        
        setError('');
      } else {
        setError('Invalid data structure: missing data array');
      }
    }
  }, [initialData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!plotData) return;
      
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setTimelineDepth(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setTimelineDepth(prev => Math.min(maxDepth, prev + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [plotData, maxDepth]);

  const parseJSON = () => {
    try {
      const parsed = JSON.parse(jsonInput) as PlotData;
      setPlotData(parsed);
      
      const depths = parsed.data.map(node => getNodeDepth(node, parsed.data));
      const max = Math.max(...depths);
      setMaxDepth(max);
      setTimelineDepth(max);
      
      setSelectedAxes({ x: 0, y: 1 });
      setAxisDirections({ x: 1, y: 1 });
      
      setError('');
    } catch (e) {
      setError('Invalid JSON: ' + (e as Error).message);
    }
  };

  const handleAxisClick = (side: string) => {
    setShowAxisPicker(side);
  };

  const selectAxis = (side: string, axisIndex: number) => {
    if (side === 'left' || side === 'right') {
      setSelectedAxes(prev => ({ ...prev, x: axisIndex }));
      setAxisDirections(prev => ({ ...prev, x: side === 'left' ? -1 : 1 }));
    } else {
      setSelectedAxes(prev => ({ ...prev, y: axisIndex }));
      setAxisDirections(prev => ({ ...prev, y: side === 'top' ? 1 : -1 }));
    }
    setShowAxisPicker(null);
  };

  const getNodeDepth = (node: PlotData['data'][0], allData: PlotData['data']): number => {
    if (!node.replies_to) return 0;
    const parent = allData.find(d => d.id === node.replies_to);
    if (!parent) return 0;
    return 1 + getNodeDepth(parent, allData);
  };

  const isNodeVisible = (node: PlotData['data'][0], allData: PlotData['data']): boolean => {
    const depth = getNodeDepth(node, allData);
    return depth <= timelineDepth;
  };

  const isConnectionVisible = (node: PlotData['data'][0], parent: PlotData['data'][0], allData: PlotData['data']): boolean => {
    const nodeDepth = getNodeDepth(node, allData);
    const parentDepth = getNodeDepth(parent, allData);
    return nodeDepth <= timelineDepth && parentDepth <= timelineDepth;
  };

  const getAuthorTrajectory = (author: string, allData: PlotData['data']) => {
    const authorMessages = allData
      .filter(node => node.author === author)
      .map(node => ({ ...node, depth: getNodeDepth(node, allData) }))
      .sort((a, b) => a.depth - b.depth);
    
    return authorMessages;
  };

  const createSmoothPath = (points: Array<{x: number, y: number}>) => {
    if (points.length < 2) return '';
    
    let path = `M ${points[0].x} ${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
      const curr = points[i];
      
      if (i === 1) {
        path += ` L ${curr.x} ${curr.y}`;
      } else {
        const prev = points[i - 1];
        const controlX = prev.x;
        const controlY = prev.y;
        path += ` Q ${controlX} ${controlY} ${curr.x} ${curr.y}`;
      }
    }
    
    return path;
  };

  const getAuthorColor = (author: string, data: PlotData['data']) => {
    if (!data) return COLORS[0];
    const authors = [...new Set(data.map(d => d.author))];
    const index = authors.indexOf(author);
    return data.find(d => d.author === author)?.color || COLORS[index % COLORS.length];
  };

  const coordsToPixels = (coords: number[], width: number, height: number, allData: PlotData['data'], nodeId: string) => {
    const xValue = coords[selectedAxes.x] * axisDirections.x;
    const yValue = coords[selectedAxes.y] * axisDirections.y;
    
    const padding = 80;
    const plotWidth = width - 2 * padding;
    const plotHeight = height - 2 * padding;
    
    const allX = allData.map(d => d.coords[selectedAxes.x] * axisDirections.x);
    const allY = allData.map(d => d.coords[selectedAxes.y] * axisDirections.y);
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);
    
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    
    const marginFactor = 0.1;
    const expandedRangeX = rangeX * (1 + 2 * marginFactor);
    const expandedRangeY = rangeY * (1 + 2 * marginFactor);
    
    const normalizedX = (xValue - minX + rangeX * marginFactor) / expandedRangeX;
    const normalizedY = (yValue - minY + rangeY * marginFactor) / expandedRangeY;
    
    let pixelX = padding + normalizedX * plotWidth;
    let pixelY = padding + (1 - normalizedY) * plotHeight;
    
    if (nodeId) {
      const seed = nodeId.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
      const pseudoRandom1 = (Math.sin(seed * 12.9898) * 43758.5453) % 1;
      const pseudoRandom2 = (Math.sin(seed * 78.233) * 43758.5453) % 1;
      
      pixelX += (pseudoRandom1 - 0.5) * 20;
      pixelY += (pseudoRandom2 - 0.5) * 20;
    }
    
    return [pixelX, pixelY];
  };

  const getCurvedPath = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    
    const curvature = 0.3;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    
    const offsetX = -dy * curvature;
    const offsetY = dx * curvature;
    
    const controlX = midX + offsetX;
    const controlY = midY + offsetY;
    
    return `M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`;
  };

  const getArrowhead = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    
    const curvature = 0.3;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const offsetX = -dy * curvature;
    const offsetY = dx * curvature;
    const controlX = midX + offsetX;
    const controlY = midY + offsetY;
    
    const t = 0.95;
    
    const dx_dt = 2 * (1 - t) * (controlX - x1) + 2 * t * (x2 - controlX);
    const dy_dt = 2 * (1 - t) * (controlY - y1) + 2 * t * (y2 - controlY);
    const angle = Math.atan2(dy_dt, dx_dt);
    
    const arrowLength = 12;
    const nodeRadius = 30;
    
    const tipX = x2 - Math.cos(angle) * nodeRadius;
    const tipY = y2 - Math.sin(angle) * nodeRadius;
    
    const left1 = tipX - Math.cos(angle - Math.PI / 6) * arrowLength;
    const left2 = tipY - Math.sin(angle - Math.PI / 6) * arrowLength;
    const right1 = tipX - Math.cos(angle + Math.PI / 6) * arrowLength;
    const right2 = tipY - Math.sin(angle + Math.PI / 6) * arrowLength;
    
    return `M ${tipX} ${tipY} L ${left1} ${left2} M ${tipX} ${tipY} L ${right1} ${right2}`;
  };

  const getReplyChain = (node: PlotData['data'][0], data: PlotData['data'], maxDepth = 3) => {
    const chain = [];
    let current = node;
    let count = 0;
    
    while (current && current.replies_to && count < maxDepth) {
      const parent = data.find(d => d.id === current.replies_to);
      if (parent) {
        chain.unshift(parent);
        current = parent;
        count++;
      } else {
        break;
      }
    }
    
    return chain;
  };

  const getNodeOpacity = (nodeId: string, allData: PlotData['data']) => {
    if (!hoveredNode) return 1;
    if (nodeId === hoveredNode) return 1;
    
    const hoveredNodeData = allData.find(n => n.id === hoveredNode);
    if (!hoveredNodeData) return 0.05;
    
    const chain = getReplyChain(hoveredNodeData, allData, 999);
    const nodeIndex = chain.findIndex(n => n.id === nodeId);
    
    if (nodeIndex === -1) return 0.05;
    
    const fadeStep = 0.15;
    const opacity = 1 - (chain.length - nodeIndex) * fadeStep;
    return Math.max(opacity, 0.3);
  };

  const getConnectionOpacity = (fromId: string, toId: string, allData: PlotData['data']) => {
    if (!hoveredNode) return 1;
    
    const hoveredNodeData = allData.find(n => n.id === hoveredNode);
    if (!hoveredNodeData) return 0.05;
    
    const chain = getReplyChain(hoveredNodeData, allData, 999);
    const chainIds = [...chain.map(n => n.id), hoveredNode];
    
    if (!chainIds.includes(fromId) && !chainIds.includes(toId)) {
      return 0.05;
    }
    
    const toIndex = chainIds.indexOf(toId);
    if (toIndex === -1) return 0.05;
    
    const fadeStep = 0.12;
    const opacity = 1 - (chainIds.length - 1 - toIndex) * fadeStep;
    return Math.max(opacity, 0.35);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('.tooltip-content')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - tooltipPos.x,
      y: e.clientY - tooltipPos.y
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const newPos = {
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      };
      setTooltipPos(newPos);
      localStorage.setItem('tooltipPosition', JSON.stringify(newPos));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  if (!plotData) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gray-50 p-8">
        <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold mb-4">Interactive Plot Visualizer</h1>
          <textarea
            className="w-full h-64 p-4 border border-gray-300 rounded font-mono text-sm"
            placeholder="Paste your JSON here..."
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
          />
          {error && (
            <div className="mt-2 text-red-600 text-sm">{error}</div>
          )}
          <button
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={parseJSON}
          >
            Generate Plot
          </button>
        </div>
      </div>
    );
  }

  // Make the graph responsive to available space
  const { width, height } = dimensions;
  const { axes, data } = plotData;
  
  if (!axes || !data) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-red-600">Invalid data format. Please check your JSON structure.</div>
      </div>
    );
  }

  const hoveredNodeData = hoveredNode ? data.find(n => n.id === hoveredNode) : null;
  
  const getMessagesAtDepth = () => {
    if (!data) return [];
    return data.filter(node => getNodeDepth(node, data) === timelineDepth);
  };
  
  const timelineMessages = !hoveredNode ? getMessagesAtDepth() : [];
  const displayMessages = hoveredNode ? [hoveredNodeData].filter(Boolean) : timelineMessages;

  const xAxis = axes[selectedAxes.x];
  const yAxis = axes[selectedAxes.y];
  const xLabel = axisDirections.x === 1 ? xAxis.positive : xAxis.negative;
  const xLabelNeg = axisDirections.x === 1 ? xAxis.negative : xAxis.positive;
  const yLabel = axisDirections.y === 1 ? yAxis.positive : yAxis.negative;
  const yLabelNeg = axisDirections.y === 1 ? yAxis.negative : yAxis.positive;

  return (
    <div className="w-full h-full flex flex-col bg-gray-50">
      {/* Consolidated Controls Header */}
      <div className="px-4 py-3 bg-white border-b flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          {/* Left side: Checkboxes */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showContext}
                onChange={(e) => setShowContext(e.target.checked)}
                className="w-3 h-3"
              />
              <span className="text-xs text-gray-800">Context</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={showTrajectory}
                onChange={(e) => setShowTrajectory(e.target.checked)}
                className="w-3 h-3"
              />
              <span className="text-xs text-gray-800">Trajectory</span>
            </label>
            {showTrajectory && (
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={smoothTrajectory}
                  onChange={(e) => setSmoothTrajectory(e.target.checked)}
                  className="w-3 h-3"
                />
                <span className="text-xs text-gray-800">Simple</span>
              </label>
            )}
          </div>

          {/* Center: Timeline Controls */}
          <div className="flex-1 flex flex-col items-center gap-2 max-w-lg">
            <div className="flex items-center justify-between w-full">
              <button
                className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                onClick={() => setTimelineDepth(Math.max(0, timelineDepth - 1))}
                disabled={timelineDepth === 0}
              >
                ←
              </button>
              <span className="text-xs font-semibold">Level {timelineDepth}/{maxDepth}</span>
              <button
                className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                onClick={() => setTimelineDepth(Math.min(maxDepth, timelineDepth + 1))}
                disabled={timelineDepth === maxDepth}
              >
                →
              </button>
            </div>
            <input
              type="range"
              min="0"
              max={maxDepth}
              value={timelineDepth}
              onChange={(e) => setTimelineDepth(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(timelineDepth / maxDepth) * 100}%, #e5e7eb ${(timelineDepth / maxDepth) * 100}%, #e5e7eb 100%)`
              }}
            />
          </div>

          {/* Right side: Load Data Button */}
          <button
            className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
            onClick={() => setPlotData(null)}
          >
            Load Data
          </button>
        </div>
      </div>
      
      <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-gray-50">
        <svg ref={svgRef} width={width} height={height} className="bg-white">
          <line x1="80" y1={height/2} x2={width-80} y2={height/2} stroke="#666" strokeWidth="2" />
          <line x1={width/2} y1="80" x2={width/2} y2={height-80} stroke="#666" strokeWidth="2" />
          
          <text 
            x={width/2} 
            y="40" 
            textAnchor="middle" 
            className="text-sm font-semibold cursor-pointer hover:text-blue-600"
            onClick={() => handleAxisClick('top')}
          >
            {yLabel}
          </text>
          <text 
            x={width/2} 
            y={height-40} 
            textAnchor="middle" 
            className="text-sm font-semibold cursor-pointer hover:text-blue-600"
            onClick={() => handleAxisClick('bottom')}
          >
            {yLabelNeg}
          </text>
          <text 
            x="40" 
            y={height/2} 
            textAnchor="middle" 
            className="text-sm font-semibold cursor-pointer hover:text-blue-600" 
            transform={`rotate(-90, 40, ${height/2})`}
            onClick={() => handleAxisClick('left')}
          >
            {xLabelNeg}
          </text>
          <text 
            x={width-40} 
            y={height/2} 
            textAnchor="middle" 
            className="text-sm font-semibold cursor-pointer hover:text-blue-600" 
            transform={`rotate(90, ${width-40}, ${height/2})`}
            onClick={() => handleAxisClick('right')}
          >
            {xLabel}
          </text>
          
          {!showTrajectory && (
            <g id="connections">
              {data.map((node: PlotData['data'][0]) => {
                if (!node.replies_to) return null;
                const parent = data.find(d => d.id === node.replies_to);
                if (!parent) return null;
                
                if (!isConnectionVisible(node, parent, data)) return null;
                
                const [x1, y1] = coordsToPixels(parent.coords, width, height, data, parent.id);
                const [x2, y2] = coordsToPixels(node.coords, width, height, data, node.id);
                const color = getAuthorColor(node.author, data);
                const opacity = getConnectionOpacity(parent.id, node.id, data);
                
                return (
                  <g key={`${node.id}-connection`} opacity={opacity}>
                    <path
                      d={getCurvedPath(x1, y1, x2, y2)}
                      stroke={color}
                      strokeWidth="2"
                      fill="none"
                    />
                    <path
                      d={getArrowhead(x1, y1, x2, y2)}
                      stroke={color}
                      strokeWidth="2"
                      fill="none"
                    />
                  </g>
                );
              })}
            </g>
          )}
          
          {showTrajectory && (
            <g id="trajectories">
              {[...new Set(data.map(d => d.author))].map((author: string) => {
                const trajectory = getAuthorTrajectory(author, data);
                if (trajectory.length < 1) return null;
                
                const visibleTrajectory = trajectory.filter(node => 
                  getNodeDepth(node, data) <= timelineDepth
                );
                
                if (visibleTrajectory.length < 1) return null;
                
                const points = visibleTrajectory.map(node => {
                  const [x, y] = coordsToPixels(node.coords, width, height, data, node.id);
                  return { x, y, node };
                });
                
                const color = getAuthorColor(author, data);
                
                // Create path - either smooth or straight line
                let pathData;
                if (!smoothTrajectory) {
                  pathData = createSmoothPath(points);
                } else {
                  // Simple straight line from first to last point
                  const firstPoint = points[0];
                  const lastPoint = points[points.length - 1];
                  pathData = `M ${firstPoint.x} ${firstPoint.y} L ${lastPoint.x} ${lastPoint.y}`;
                }
                
                const lastPoint = points[points.length - 1];
                const secondLastPoint = !smoothTrajectory && points.length > 1 ? points[points.length - 2] : points[0];
                const angle = Math.atan2(lastPoint.y - secondLastPoint.y, lastPoint.x - secondLastPoint.x);
                const arrowSize = 10;
                
                return (
                  <g key={`trajectory-${author}`}>
                    <path
                      d={pathData}
                      stroke={color}
                      strokeWidth="3"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.8"
                    />
                    <path
                      d={`M ${lastPoint.x} ${lastPoint.y} 
                          L ${lastPoint.x - arrowSize * Math.cos(angle - Math.PI / 6)} ${lastPoint.y - arrowSize * Math.sin(angle - Math.PI / 6)}
                          M ${lastPoint.x} ${lastPoint.y}
                          L ${lastPoint.x - arrowSize * Math.cos(angle + Math.PI / 6)} ${lastPoint.y - arrowSize * Math.sin(angle + Math.PI / 6)}`}
                      stroke={color}
                      strokeWidth="3"
                      strokeLinecap="round"
                      opacity="0.8"
                    />
                    {points.map((point: {x: number, y: number, node: PlotData['data'][0]}, idx: number) => (
                      <g 
                        key={`marker-${author}-${idx}`}
                        onMouseEnter={() => setHoveredNode(point.node.id)}
                        onMouseLeave={() => setHoveredNode(null)}
                        style={{ cursor: 'pointer' }}
                      >
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="15"
                          fill={color}
                          opacity="0.6"
                          stroke={color}
                          strokeWidth="2"
                        />
                        <text
                          x={point.x}
                          y={point.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize="18"
                          pointerEvents="none"
                        >
                          {point.node.emoji}
                        </text>
                      </g>
                    ))}
                  </g>
                );
              })}
            </g>
          )}
          
          {!showTrajectory && (
            <g id="nodes">
              {data.map((node: PlotData['data'][0]) => {
                if (!isNodeVisible(node, data)) return null;
                
                const [x, y] = coordsToPixels(node.coords, width, height, data, node.id);
                const color = getAuthorColor(node.author, data);
                const isHovered = hoveredNode === node.id;
                const nodeOpacity = getNodeOpacity(node.id, data);
                
                return (
                  <g
                    key={node.id}
                    onMouseEnter={() => setHoveredNode(node.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    style={{ cursor: 'pointer' }}
                    opacity={nodeOpacity}
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r={isHovered ? 35 : 30}
                      fill={color}
                      opacity="0.6"
                      stroke={color}
                      strokeWidth={isHovered ? 3 : 2}
                    />
                    <text
                      x={x}
                      y={y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="24"
                      pointerEvents="none"
                    >
                      {node.emoji}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>
        
        {showAxisPicker && (
          <div 
            className="absolute bg-white border-2 border-blue-600 rounded-lg shadow-xl p-3 z-50"
            style={{
              left: showAxisPicker === 'left' ? '100px' : showAxisPicker === 'right' ? 'auto' : '50%',
              right: showAxisPicker === 'right' ? '100px' : 'auto',
              top: showAxisPicker === 'top' ? '120px' : showAxisPicker === 'bottom' ? 'auto' : '50%',
              bottom: showAxisPicker === 'bottom' ? '120px' : 'auto',
              transform: (showAxisPicker === 'top' || showAxisPicker === 'bottom') ? 'translateX(-50%)' : 'translateY(-50%)'
            }}
          >
            <div className="text-xs font-semibold text-gray-900 mb-2">Select Axis:</div>
            <div className="space-y-1">
              {axes.map((axis: PlotData['axes'][0], idx: number) => (
                <button
                  key={idx}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-blue-50 rounded"
                  onClick={() => selectAxis(showAxisPicker!, idx)}
                >
                  <div className="font-semibold text-gray-900">{axis.label}</div>
                  <div className="text-xs text-gray-700">
                    {showAxisPicker === 'left' || showAxisPicker === 'bottom' ? axis.negative : axis.positive}
                  </div>
                </button>
              ))}
            </div>
            <button
              className="mt-2 w-full text-xs text-gray-700 hover:text-gray-900"
              onClick={() => setShowAxisPicker(null)}
            >
              Cancel
            </button>
          </div>
        )}
        
        <div
          className="fixed bg-white border-2 border-gray-800 rounded-lg shadow-2xl z-50"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
            width: '450px',
            maxWidth: '90vw',
            maxHeight: '80vh',
            cursor: isDragging ? 'grabbing' : 'grab',
            display: 'flex',
            flexDirection: 'column'
          }}
          onMouseDown={handleMouseDown}
        >
          <div className="bg-gray-200 text-gray-800 px-4 py-2 rounded-t-lg font-semibold text-sm flex items-center justify-between flex-shrink-0">
            <span>Message Details</span>
            <span className="text-xs opacity-75">Click and drag to move</span>
          </div>
          <div 
            className="tooltip-content p-4 overflow-y-auto flex-1" 
            style={{ cursor: 'default', minHeight: '100px' }}
          >
            {displayMessages.length === 0 ? (
              <div className="text-gray-700 italic text-center py-8">
                {hoveredNode ? 'No message selected' : 'Hover over a message to view details'}
              </div>
            ) : (
              <div className="space-y-4">
                {displayMessages.filter((msg): msg is PlotData['data'][0] => msg !== null && msg !== undefined).map((msg: PlotData['data'][0], idx: number) => (
                  <div key={msg.id} className={idx > 0 ? 'pt-4 border-t-2 border-gray-200' : ''}>
                    {showContext && msg.replies_to && (
                      <div className="mb-4 pb-4 border-b-2 border-gray-200">
                        <div className="text-xs font-semibold text-gray-700 mb-2">REPLY CONTEXT (max 3):</div>
                        {getReplyChain(msg, data).map((parentNode: PlotData['data'][0]) => (
                          <div key={parentNode.id} className="mb-3 pl-3 border-l-2 border-gray-300">
                            <div className="font-bold text-gray-700 text-xs mb-1">
                              {parentNode.emoji} {parentNode.author}
                            </div>
                            <div className="text-gray-800 text-xs leading-relaxed">
                              {parentNode.text.length > 120 ? parentNode.text.substring(0, 120) + '...' : parentNode.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {!hoveredNode && displayMessages.length > 1 && (
                      <div className="mb-2 text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block">
                        {msg.replies_to ? 'Reply' : 'Root message'}
                      </div>
                    )}
                    
                    <div className="font-bold text-gray-900 mb-2 text-base">
                      {msg.emoji} {msg.author}
                    </div>
                    <div className="text-gray-800 mb-3 text-sm leading-relaxed border-l-4 border-gray-400 pl-3 font-medium">
                      {msg.text}
                    </div>
                    <div className="text-gray-700 text-xs italic bg-gray-50 p-2 rounded">
                      {msg.estimation}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="px-4 py-3 bg-white border-t flex-shrink-0">
        <div className="flex flex-wrap gap-3 justify-center">
          {[...new Set(data.map(d => d.author))].map((author: string) => (
            <div key={author} className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: getAuthorColor(author, data) }}
              />
              <span className="text-xs">{author}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PlotVisualizer;