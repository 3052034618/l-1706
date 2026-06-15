import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { fetchListings, fetchMyListings, createListing, cancelListing, buyListing, fetchSoundTide } from '../store/slices/marketSlice';
import { fetchMaterials, fetchDetectors } from '../store/slices/craftingSlice';
import { fetchPlayerData } from '../store/slices/playerSlice';
import { RARITY_COLORS, RARITY_NAMES, AFFIX_INFO, getQualityColor } from '../utils/constants';
import './Market.scss';

const Market: React.FC = () => {
  const dispatch = useDispatch();
  const { listings, myListings, soundTide, loading, total } = useSelector((state: RootState) => state.market);
  const { materials, detectors } = useSelector((state: RootState) => state.crafting);
  const { data: player } = useSelector((state: RootState) => state.player);
  const [activeTab, setActiveTab] = useState<'all' | 'my' | 'inventory'>('all');
  const [filterType, setFilterType] = useState('all');
  const [inventoryTab, setInventoryTab] = useState<'materials' | 'detectors'>('materials');
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellItem, setSellItem] = useState<any>(null);
  const [sellPrice, setSellPrice] = useState('');
  const [sellQuantity, setSellQuantity] = useState(1);
  const [suggestedPrice, setSuggestedPrice] = useState<{ min: number; max: number } | null>(null);

  useEffect(() => {
    dispatch(fetchListings({ type: filterType }) as any);
    dispatch(fetchMyListings() as any);
    dispatch(fetchSoundTide() as any);
    dispatch(fetchMaterials() as any);
    dispatch(fetchDetectors() as any);
  }, [dispatch, filterType]);

  useEffect(() => {
    if (sellItem) {
      const min = sellItem.quality ? sellItem.quality * 10 : 50;
      const max = sellItem.quality ? sellItem.quality * 30 : 200;
      setSuggestedPrice({ min, max });
      setSellPrice(String(Math.floor((min + max) / 2)));
    }
  }, [sellItem]);

  const handleBuy = (listingId: string) => {
    if (!window.confirm('确定要购买这件商品吗？')) return;
    
    dispatch(buyListing(listingId) as any).then((result: any) => {
      if (result.meta.requestStatus === 'fulfilled') {
        dispatch(fetchListings({ type: filterType }) as any);
        dispatch(fetchMyListings() as any);
        dispatch(fetchPlayerData() as any);
        dispatch(fetchMaterials() as any);
        dispatch(fetchDetectors() as any);
      }
    });
  };

  const handleCancel = (listingId: string) => {
    if (!window.confirm('确定要取消上架吗？')) return;
    
    dispatch(cancelListing(listingId) as any).then((result: any) => {
      if (result.meta.requestStatus === 'fulfilled') {
        dispatch(fetchListings({ type: filterType }) as any);
        dispatch(fetchMyListings() as any);
        dispatch(fetchMaterials() as any);
        dispatch(fetchDetectors() as any);
      }
    });
  };

  const openSellModal = (item: any, type: string) => {
    setSellItem({ ...item, type });
    setSellQuantity(1);
    setShowSellModal(true);
  };

  const handleSell = () => {
    if (!sellItem || !sellPrice) return;
    
    const price = parseInt(sellPrice);
    if (isNaN(price) || price <= 0) return;
    
    let itemData: any = {};
    let itemId = sellItem.id;
    
    if (sellItem.type === 'material') {
      itemData = {
        material_id: sellItem.material_id,
        name: sellItem.name,
        quantity: sellQuantity,
        rarity: sellItem.rarity,
        quality: sellItem.quality,
        icon: sellItem.icon
      };
      itemId = sellItem.material_id;
    } else {
      itemData = {
        name: sellItem.name,
        tier: sellItem.tier,
        rarity: sellItem.rarity,
        quality: sellItem.quality,
        range: sellItem.range,
        precision: sellItem.precision,
        affixes: sellItem.affixes || []
      };
    }
    
    dispatch(createListing({
      itemType: sellItem.type,
      itemId,
      price,
      itemData
    }) as any).then((result: any) => {
      if (result.meta.requestStatus === 'fulfilled') {
        setShowSellModal(false);
        dispatch(fetchListings({ type: filterType }) as any);
        dispatch(fetchMyListings() as any);
        dispatch(fetchMaterials() as any);
        dispatch(fetchDetectors() as any);
        dispatch(fetchPlayerData() as any);
      }
    });
  };

  const displayListings = activeTab === 'all' ? listings : myListings;
  const tradableDetectors = detectors.filter((d: any) => d.is_tradable);
  const availableMaterials = materials.filter((m: any) => m.quantity > 0);

  return (
    <div className="market-page">
      {soundTide?.active && (
        <div className="sound-tide-banner">
          <span className="tide-icon">🌊</span>
          <div className="tide-info">
            <span className="tide-title">声波潮汐进行中！</span>
            <span className="tide-desc">
              全服探测成功率 +{Math.floor(soundTide.bonusRate * 100)}%
              · 剩余 {Math.floor(soundTide.remainingTime / 60)} 分钟
            </span>
          </div>
        </div>
      )}

      <div className="market-header">
        <div className="tabs">
          <div 
            className={`tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            🏪 全部商品
          </div>
          <div 
            className={`tab ${activeTab === 'my' ? 'active' : ''}`}
            onClick={() => setActiveTab('my')}
          >
            📦 我的上架 ({myListings.length})
          </div>
          <div 
            className={`tab ${activeTab === 'inventory' ? 'active' : ''}`}
            onClick={() => setActiveTab('inventory')}
          >
            💰 出售物品
          </div>
        </div>
        
        <div className="filters">
          {activeTab !== 'inventory' && (
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">全部类型</option>
              <option value="material">材料</option>
              <option value="detector">探测器</option>
            </select>
          )}
          <div className="player-gold">
            💰 {player?.gold?.toLocaleString() || 0}
          </div>
        </div>
      </div>

      {activeTab === 'inventory' && (
        <div className="inventory-section">
          <div className="inventory-tabs">
            <div 
              className={`inv-tab ${inventoryTab === 'materials' ? 'active' : ''}`}
              onClick={() => setInventoryTab('materials')}
            >
              材料 ({availableMaterials.length})
            </div>
            <div 
              className={`inv-tab ${inventoryTab === 'detectors' ? 'active' : ''}`}
              onClick={() => setInventoryTab('detectors')}
            >
              探测器 ({tradableDetectors.length})
            </div>
          </div>

          {inventoryTab === 'materials' && (
            <div className="inventory-grid">
              {availableMaterials.map((mat: any) => (
                <div key={mat.material_id} className="inventory-card">
                  <div className="inv-icon">{mat.icon || '📦'}</div>
                  <div className="inv-info">
                    <h4 className="inv-name">{mat.name}</h4>
                    <span className="inv-rarity" style={{ color: RARITY_COLORS[mat.rarity] }}>
                      {RARITY_NAMES[mat.rarity]}
                    </span>
                    <div className="inv-stats">
                      <span>数量: {mat.quantity}</span>
                      <span>品质: {mat.quality}</span>
                    </div>
                  </div>
                  <button 
                    className="sell-btn"
                    onClick={() => openSellModal(mat, 'material')}
                    disabled={mat.quantity <= 0}
                  >
                    出售
                  </button>
                </div>
              ))}
              {availableMaterials.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon">📦</div>
                  <p>没有可出售的材料</p>
                </div>
              )}
            </div>
          )}

          {inventoryTab === 'detectors' && (
            <div className="inventory-grid">
              {tradableDetectors.map((detector: any) => (
                <div 
                  key={detector.id} 
                  className="inventory-card detector-inv-card"
                  style={{ borderColor: RARITY_COLORS[detector.rarity] }}
                >
                  <div className="inv-header">
                    <h4 className="inv-name">{detector.name}</h4>
                    <span 
                      className="rarity-badge"
                      style={{ background: RARITY_COLORS[detector.rarity] }}
                    >
                      {RARITY_NAMES[detector.rarity]}
                    </span>
                  </div>
                  <div className="inv-stats">
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
                    <div className="inv-affixes">
                      {detector.affixes.slice(0, 3).map((affixId: string) => {
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
                  )}
                  <button 
                    className="sell-btn"
                    onClick={() => openSellModal(detector, 'detector')}
                  >
                    上架出售
                  </button>
                </div>
              ))}
              {tradableDetectors.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon">🔮</div>
                  <p>没有可交易的探测器</p>
                  <p className="empty-hint">制作探测器时有几率获得可交易版本</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab !== 'inventory' && (
        <div className="listings-grid">
          {displayListings.map((listing: any) => {
            const itemData = listing.itemData || {};
            const isMyListing = listing.seller_id === player?.id;
            
            return (
              <div 
                key={listing.id} 
                className="listing-card"
                style={{ borderColor: RARITY_COLORS[itemData.rarity] || '#95a5a6' }}
              >
                <div className="listing-header">
                  <span className="item-type">
                    {listing.item_type === 'material' ? '📦 材料' : '🔮 探测器'}
                  </span>
                  {isMyListing && (
                    <span className="my-tag">我的</span>
                  )}
                </div>
                
                <div className="listing-body">
                  <h4 className="item-name">{itemData.name || listing.item_id}</h4>
                  {itemData.rarity && (
                    <span 
                      className="rarity-badge"
                      style={{ background: RARITY_COLORS[itemData.rarity], color: 'white' }}
                    >
                      {RARITY_NAMES[itemData.rarity]}
                    </span>
                  )}
                  {itemData.quality && (
                    <div className="quality-info">
                      <span>品质</span>
                      <div className="quality-bar">
                        <div 
                          className="quality-fill"
                          style={{ 
                            width: `${itemData.quality}%`,
                            background: itemData.quality >= 80 ? '#f39c12' : 
                                       itemData.quality >= 60 ? '#3498db' : '#27ae60'
                          }}
                        ></div>
                      </div>
                      <span className="quality-value">{itemData.quality}</span>
                    </div>
                  )}
                  {itemData.tier && (
                    <span className="tier-tag">T{itemData.tier}</span>
                  )}
                  {itemData.quantity && (
                    <span className="qty-tag">x{itemData.quantity}</span>
                  )}
                </div>
                
                <div className="listing-footer">
                  <div className="seller-info">
                    <span className="seller-name">{listing.seller_name || '卖家'}</span>
                  </div>
                  <div className="price-info">
                    <span className="price-label">价格</span>
                    <span className="price-value">💰 {listing.price.toLocaleString()}</span>
                  </div>
                </div>
                
                <div className="listing-actions">
                  {isMyListing ? (
                    <button 
                      className="cancel-btn"
                      onClick={() => handleCancel(listing.id)}
                    >
                      取消上架
                    </button>
                  ) : (
                    <button 
                      className="buy-btn"
                      onClick={() => handleBuy(listing.id)}
                      disabled={!player || player.gold < listing.price}
                    >
                      {player?.gold < listing.price ? '金币不足' : '购买'}
                    </button>
                  )}
                </div>
                
                {listing.suggested_price_min && (
                  <div className="price-suggestion">
                    建议价: {listing.suggested_price_min} - {listing.suggested_price_max}
                  </div>
                )}
              </div>
            );
          })}
          
          {displayListings.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">🛒</div>
              <p>{activeTab === 'all' ? '暂无商品' : '还没有上架商品'}</p>
            </div>
          )}
        </div>
      )}

      {showSellModal && (
        <div className="modal-overlay" onClick={() => setShowSellModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>出售商品</h3>
            <div className="sell-item-info">
              <div className="sell-item-icon">{sellItem?.icon || '🔮'}</div>
              <div className="sell-item-details">
                <span className="item-name">{sellItem?.name}</span>
                <span className="item-rarity" style={{ color: RARITY_COLORS[sellItem?.rarity] }}>
                  {RARITY_NAMES[sellItem?.rarity]}
                </span>
                <span className="item-quality">品质: {sellItem?.quality}</span>
              </div>
            </div>
            
            {sellItem?.type === 'material' && sellItem?.quantity > 1 && (
              <div className="form-group">
                <label>出售数量 (最多 {sellItem?.quantity})</label>
                <input
                  type="number"
                  min={1}
                  max={sellItem?.quantity}
                  value={sellQuantity}
                  onChange={(e) => setSellQuantity(Math.min(sellItem.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                />
              </div>
            )}
            
            <div className="form-group">
              <label>出售价格 (金币)</label>
              <input
                type="number"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder="请输入价格"
              />
              {suggestedPrice && (
                <div className="price-suggestion-hint">
                  💡 建议价格: {suggestedPrice.min} - {suggestedPrice.max} 金币
                </div>
              )}
            </div>
            
            <div className="form-group">
              <div className="price-summary">
                <span>预计收入</span>
                <span className="total-price">💰 {parseInt(sellPrice || '0').toLocaleString()}</span>
              </div>
            </div>
            
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowSellModal(false)}>取消</button>
              <button className="confirm-btn" onClick={handleSell}>确认上架</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Market;
