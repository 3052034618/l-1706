import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { fetchRecipes, fetchMaterials, fetchDetectors, fetchTasks, startCrafting, previewCrafting } from '../store/slices/craftingSlice';
import { fetchWorkshop } from '../store/slices/workshopSlice';
import { RARITY_COLORS, RARITY_NAMES, AFFIX_INFO, formatTime, getQualityColor } from '../utils/constants';
import './Crafting.scss';

const MATERIAL_TYPE_NAMES: Record<string, string> = {
  crystal: '水晶',
  resonator: '共鸣器',
  core: '核心',
  amplifier: '放大器',
  essence: '精华'
};

const Crafting: React.FC = () => {
  const dispatch = useDispatch();
  const { recipes, materials, detectors, tasks, crafting, preview, previewLoading } = useSelector((state: RootState) => state.crafting);
  const { workshop, echosmiths } = useSelector((state: RootState) => state.workshop);
  const [selectedRecipe, setSelectedRecipe] = useState<any>(null);
  const [selectedEchosmith, setSelectedEchosmith] = useState<any>(null);
  const [orderedMaterials, setOrderedMaterials] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'craft' | 'detectors' | 'tasks'>('craft');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const previewDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    dispatch(fetchRecipes() as any);
    dispatch(fetchMaterials() as any);
    dispatch(fetchDetectors() as any);
    dispatch(fetchTasks() as any);
    dispatch(fetchWorkshop() as any);
  }, [dispatch]);

  useEffect(() => {
    if (recipes.length > 0 && !selectedRecipe) {
      setSelectedRecipe(recipes[0]);
    }
  }, [recipes, selectedRecipe]);

  useEffect(() => {
    if (echosmiths.length > 0 && !selectedEchosmith) {
      setSelectedEchosmith(echosmiths.find((e: any) => e.is_chief) || echosmiths[0]);
    }
  }, [echosmiths, selectedEchosmith]);

  useEffect(() => {
    if (selectedRecipe && materials.length > 0) {
      const initialMaterials = selectedRecipe.materials.map((m: any) => {
        const playerMat = materials.find((pm: any) => pm.material_id === m.material_id);
        return {
          material_id: m.material_id,
          quantity: m.quantity,
          quality: playerMat?.quality || 50,
          rarity: playerMat?.rarity || 'common',
          name: playerMat?.name || m.material_id,
          icon: playerMat?.icon || '📦',
          type: playerMat?.type || 'common'
        };
      });
      setOrderedMaterials(initialMaterials);
    }
  }, [selectedRecipe, materials]);

  const debouncedPreview = useCallback(() => {
    if (previewDebounceRef.current) {
      clearTimeout(previewDebounceRef.current);
    }
    previewDebounceRef.current = setTimeout(() => {
      if (selectedRecipe && selectedEchosmith && orderedMaterials.length > 0) {
        const previewMats = orderedMaterials.map(m => ({
          material_id: m.material_id,
          quality: m.quality,
          rarity: m.rarity
        }));
        dispatch(previewCrafting({
          recipeId: selectedRecipe.id,
          echosmithId: selectedEchosmith.id,
          materials: previewMats
        }) as any);
      }
    }, 150);
  }, [selectedRecipe, selectedEchosmith, orderedMaterials, dispatch]);

  useEffect(() => {
    debouncedPreview();
  }, [orderedMaterials, selectedEchosmith, debouncedPreview]);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newMaterials = [...orderedMaterials];
    const [removed] = newMaterials.splice(draggedIndex, 1);
    newMaterials.splice(targetIndex, 0, removed);
    
    setOrderedMaterials(newMaterials);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const moveMaterial = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= orderedMaterials.length) return;
    
    const newMaterials = [...orderedMaterials];
    [newMaterials[index], newMaterials[newIndex]] = [newMaterials[newIndex], newMaterials[index]];
    setOrderedMaterials(newMaterials);
  };

  const handleStartCrafting = () => {
    if (!selectedRecipe || !selectedEchosmith || !canCraft) return;
    
    const materialData = orderedMaterials.map(m => ({
      material_id: m.material_id,
      quantity: m.quantity,
      quality: m.quality,
      rarity: m.rarity
    }));
    
    dispatch(startCrafting({
      recipeId: selectedRecipe.id,
      echosmithId: selectedEchosmith.id,
      materials: materialData
    }) as any).then((result: any) => {
      if (result.meta.requestStatus === 'fulfilled') {
        dispatch(fetchTasks() as any);
        dispatch(fetchMaterials() as any);
        dispatch(fetchDetectors() as any);
      }
    });
  };

  const canCraft = selectedRecipe && selectedEchosmith && orderedMaterials.every((m: any) => {
    const playerMat = materials.find((pm: any) => pm.material_id === m.material_id);
    return playerMat && playerMat.quantity >= m.quantity;
  });

  const estimated = preview?.estimated;

  return (
    <div className="crafting-page">
      <div className="tabs">
        <div className={`tab ${activeTab === 'craft' ? 'active' : ''}`} onClick={() => setActiveTab('craft')}>
          🔧 制作台
        </div>
        <div className={`tab ${activeTab === 'detectors' ? 'active' : ''}`} onClick={() => setActiveTab('detectors')}>
          🔮 我的探测器 ({detectors.length})
        </div>
        <div className={`tab ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => setActiveTab('tasks')}>
          ⏳ 制作任务 ({tasks.filter((t: any) => t.status === 'crafting').length})
        </div>
      </div>

      {activeTab === 'craft' && (
        <div className="crafting-content">
          <div className="recipe-list">
            <h3>配方列表</h3>
            <div className="recipes">
              {recipes.map((recipe: any) => (
                <div
                  key={recipe.id}
                  className={`recipe-card ${selectedRecipe?.id === recipe.id ? 'selected' : ''}`}
                  onClick={() => setSelectedRecipe(recipe)}
                >
                  <div className="recipe-tier">T{recipe.tier}</div>
                  <h4>{recipe.name}</h4>
                  <p>{recipe.description}</p>
                  <div className="recipe-stats">
                    <span>范围: {recipe.base_range}</span>
                    <span>精度: {recipe.base_precision}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="crafting-panel">
            {selectedRecipe && (
              <>
                <div className="crafting-header">
                  <h2>{selectedRecipe.name}</h2>
                  <div className="craft-time">⏱ {formatTime(selectedRecipe.craft_time)}</div>
                </div>

                <div className="section">
                  <h4>选择回声师</h4>
                  <div className="echosmith-select">
                    {echosmiths.map((es: any) => (
                      <div
                        key={es.id}
                        className={`echosmith-option ${selectedEchosmith?.id === es.id ? 'selected' : ''}`}
                        onClick={() => setSelectedEchosmith(es)}
                      >
                        <div className="es-name">
                          {es.name}
                          {es.is_chief && <span className="chief-badge">首席</span>}
                        </div>
                        <div className="es-skills">
                          <span title="听力">👂 {es.hearing_skill}</span>
                          <span title="调制">🎚 {es.modulation_skill}</span>
                          <span title="探测">🔍 {es.detection_skill}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="section">
                  <h4>材料顺序 (拖拽调整，位置越前权重越高)</h4>
                  <div className="materials-list">
                    {orderedMaterials.map((m: any, index: number) => {
                      const playerMat = materials.find((pm: any) => pm.material_id === m.material_id);
                      const hasEnough = playerMat && playerMat.quantity >= m.quantity;
                      return (
                        <div
                          key={m.material_id + '-' + index}
                          className={`material-slot ${!hasEnough ? 'insufficient' : ''} ${draggedIndex === index ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
                          draggable
                          onDragStart={() => handleDragStart(index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, index)}
                          onDragEnd={handleDragEnd}
                        >
                          <span className="slot-number">{index + 1}</span>
                          <span className="drag-handle">⋮⋮</span>
                          <span className="mat-icon">{playerMat?.icon || '📦'}</span>
                          <span className="mat-name">{playerMat?.name || m.material_id}</span>
                          <span className="mat-type">
                            {MATERIAL_TYPE_NAMES[playerMat?.type] || playerMat?.type || '材料'}
                          </span>
                          <span className="mat-rarity" style={{ color: RARITY_COLORS[playerMat?.rarity] }}>
                            {RARITY_NAMES[playerMat?.rarity] || ''}
                          </span>
                          <span className="mat-qty">
                            {playerMat?.quantity || 0} / {m.quantity}
                          </span>
                          <div className="move-buttons">
                            <button 
                              className="move-btn" 
                              onClick={(e) => { e.stopPropagation(); moveMaterial(index, 'up'); }}
                              disabled={index === 0}
                            >↑</button>
                            <button 
                              className="move-btn" 
                              onClick={(e) => { e.stopPropagation(); moveMaterial(index, 'down'); }}
                              disabled={index === orderedMaterials.length - 1}
                            >↓</button>
                          </div>
                        </div>
                      );
                    })}
                    <p className="materials-hint">
                      💡 提示：不同类型材料放在不同位置会影响最终属性。水晶侧重范围，共鸣器侧重精度，放大器提升词缀几率
                    </p>
                  </div>
                </div>

                <div className="section">
                  <h4>预估属性 {previewLoading && <span className="loading-hint">(计算中...)</span>}</h4>
                  <div className="estimates">
                    <div className="estimate-item">
                      <span className="est-label">品质</span>
                      <span className="est-value" style={{ color: estimated ? getQualityColor(estimated.quality) : '#888' }}>
                        ~{estimated?.quality || '--'}
                      </span>
                    </div>
                    <div className="estimate-item">
                      <span className="est-label">探测范围</span>
                      <span className="est-value">
                        ~{estimated?.range || '--'}
                      </span>
                    </div>
                    <div className="estimate-item">
                      <span className="est-label">探测精度</span>
                      <span className="est-value">
                        ~{estimated?.precision || '--'}
                      </span>
                    </div>
                    <div className="estimate-item">
                      <span className="est-label">词缀几率</span>
                      <span className="est-value">
                        ~{estimated?.affixChance?.toFixed?.(1) || '--'}%
                      </span>
                    </div>
                  </div>
                  {estimated && (
                    <div className="estimates" style={{ marginTop: '12px', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                      <div className="estimate-item">
                        <span className="est-label">稀有度</span>
                        <span className="est-value" style={{ color: RARITY_COLORS[estimated.rarity] }}>
                          {RARITY_NAMES[estimated.rarity]}
                        </span>
                      </div>
                      <div className="estimate-item">
                        <span className="est-label">隐藏属性</span>
                        <span className="est-value">
                          ~{estimated.hiddenChance || 0}%
                        </span>
                      </div>
                      <div className="estimate-item">
                        <span className="est-label">制作时间</span>
                        <span className="est-value">
                          {formatTime(preview?.craftTime || selectedRecipe.craft_time)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <button 
                  className="craft-btn"
                  onClick={handleStartCrafting}
                  disabled={!canCraft || crafting}
                >
                  {crafting ? '制作中...' : '开始制作'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'detectors' && (
        <div className="detectors-grid">
          {detectors.map((detector: any) => (
            <div 
              key={detector.id} 
              className="detector-card"
              style={{ borderColor: RARITY_COLORS[detector.rarity] }}
            >
              <div className="detector-header">
                <h4>{detector.name}</h4>
                <span 
                  className="rarity-badge"
                  style={{ background: RARITY_COLORS[detector.rarity] }}
                >
                  {RARITY_NAMES[detector.rarity]}
                </span>
              </div>
              
              <div className="detector-stats">
                <div className="stat-row">
                  <span>品质</span>
                  <div className="quality-bar">
                    <div 
                      className="quality-fill" 
                      style={{ width: `${detector.quality}%`, background: getQualityColor(detector.quality) }}
                    ></div>
                  </div>
                  <span className="stat-value">{detector.quality}</span>
                </div>
                <div className="stat-row">
                  <span>范围</span>
                  <span className="stat-value">{detector.range}</span>
                </div>
                <div className="stat-row">
                  <span>精度</span>
                  <span className="stat-value">{detector.precision}</span>
                </div>
              </div>

              {detector.affixes?.length > 0 && (
                <div className="detector-affixes">
                  <span className="affixes-label">词缀:</span>
                  <div className="affix-list">
                    {detector.affixes.map((affixId: string) => {
                      const affix = AFFIX_INFO[affixId];
                      return affix ? (
                        <span 
                          key={affixId} 
                          className="affix-tag"
                          style={{ background: affix.color + '30', color: affix.color, borderColor: affix.color }}
                        >
                          {affix.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              )}

              <div className="detector-footer">
                <span className="tier-badge">T{detector.tier}</span>
                {detector.is_tradable ? (
                  <span className="tradable-tag">可交易</span>
                ) : (
                  <span className="bound-tag">已绑定</span>
                )}
              </div>
            </div>
          ))}
          
          {detectors.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">🔮</div>
              <p>还没有探测器，去制作台制作一个吧！</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="tasks-list">
          {tasks.map((task: any) => {
            const isCrafting = task.status === 'crafting';
            const progress = isCrafting 
              ? Math.min(100, ((Date.now() - task.start_time) / (task.end_time - task.start_time)) * 100)
              : 100;
            
            return (
              <div key={task.id} className={`task-card ${task.status}`}>
                <div className="task-info">
                  <h4>{task.recipe_name}</h4>
                  <p className="task-status">
                    {task.status === 'crafting' ? '制作中...' : 
                     task.status === 'completed' ? '已完成' : '已取消'}
                  </p>
                </div>
                <div className="task-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <span className="progress-text">
                    {task.status === 'crafting' 
                      ? formatTime((task.end_time - Date.now()) / 1000) + ' 剩余'
                      : '完成'}
                  </span>
                </div>
              </div>
            );
          })}
          
          {tasks.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">⏳</div>
              <p>暂无制作任务</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Crafting;
