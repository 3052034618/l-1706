import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { fetchRecipes, fetchMaterials, fetchDetectors, fetchTasks, startCrafting } from '../store/slices/craftingSlice';
import { fetchWorkshop } from '../store/slices/workshopSlice';
import { RARITY_COLORS, RARITY_NAMES, AFFIX_INFO, formatTime, getQualityColor } from '../utils/constants';
import './Crafting.scss';

const Crafting: React.FC = () => {
  const dispatch = useDispatch();
  const { recipes, materials, detectors, tasks, crafting } = useSelector((state: RootState) => state.crafting);
  const { workshop, echosmiths } = useSelector((state: RootState) => state.workshop);
  const [selectedRecipe, setSelectedRecipe] = useState<any>(null);
  const [selectedEchosmith, setSelectedEchosmith] = useState<any>(null);
  const [selectedMaterials, setSelectedMaterials] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'craft' | 'detectors' | 'tasks'>('craft');

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
      setSelectedEchosmith(echosmiths.find(e => e.is_chief) || echosmiths[0]);
    }
  }, [echosmiths, selectedEchosmith]);

  const handleStartCrafting = () => {
    if (!selectedRecipe || !selectedEchosmith) return;
    
    const materialData = selectedRecipe.materials.map((m: any) => {
      const playerMat = materials.find((pm: any) => pm.material_id === m.material_id);
      return {
        material_id: m.material_id,
        quantity: m.quantity,
        quality: playerMat?.quality || 50,
        rarity: playerMat?.rarity || 'common'
      };
    });
    
    dispatch(startCrafting({
      recipeId: selectedRecipe.id,
      echosmithId: selectedEchosmith.id,
      materials: materialData
    }) as any).then((result: any) => {
      if (result.meta.requestStatus === 'fulfilled') {
        dispatch(fetchTasks() as any);
        dispatch(fetchMaterials() as any);
      }
    });
  };

  const canCraft = selectedRecipe && selectedEchosmith && selectedRecipe.materials?.every((m: any) => {
    const playerMat = materials.find((pm: any) => pm.material_id === m.material_id);
    return playerMat && playerMat.quantity >= m.quantity;
  });

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
          ⏳ 制作任务 ({tasks.filter(t => t.status === 'crafting').length})
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
                  <h4>所需材料</h4>
                  <div className="materials-list">
                    {selectedRecipe.materials?.map((m: any) => {
                      const playerMat = materials.find((pm: any) => pm.material_id === m.material_id);
                      const hasEnough = playerMat && playerMat.quantity >= m.quantity;
                      return (
                        <div key={m.material_id} className={`material-row ${hasEnough ? '' : 'insufficient'}`}>
                          <span className="mat-icon">{playerMat?.icon || '📦'}</span>
                          <span className="mat-name">{playerMat?.name || m.material_id}</span>
                          <span className="mat-rarity" style={{ color: RARITY_COLORS[playerMat?.rarity] }}>
                            {RARITY_NAMES[playerMat?.rarity] || ''}
                          </span>
                          <span className="mat-qty">
                            {playerMat?.quantity || 0} / {m.quantity}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="section">
                  <h4>预估属性</h4>
                  <div className="estimates">
                    <div className="estimate-item">
                      <span className="est-label">品质</span>
                      <span className="est-value" style={{ color: getQualityColor(60) }}>~{50 + (selectedEchosmith?.detection_skill || 1) * 5}</span>
                    </div>
                    <div className="estimate-item">
                      <span className="est-label">探测范围</span>
                      <span className="est-value">~{Math.floor(selectedRecipe.base_range * 1.1)}</span>
                    </div>
                    <div className="estimate-item">
                      <span className="est-label">探测精度</span>
                      <span className="est-value">~{Math.floor(selectedRecipe.base_precision * 1.1)}</span>
                    </div>
                    <div className="estimate-item">
                      <span className="est-label">词缀几率</span>
                      <span className="est-value">~{Math.floor(20 + (selectedEchosmith?.detection_skill || 1) * 5)}%</span>
                    </div>
                  </div>
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
