import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { fetchListings, fetchMyListings, createListing, cancelListing, buyListing, fetchSoundTide } from '../store/slices/marketSlice';
import { RARITY_COLORS, RARITY_NAMES, formatNumber } from '../utils/constants';
import './Market.scss';

const Market: React.FC = () => {
  const dispatch = useDispatch();
  const { listings, myListings, soundTide, loading, total } = useSelector((state: RootState) => state.market);
  const { data: player } = useSelector((state: RootState) => state.player);
  const [activeTab, setActiveTab] = useState<'all' | 'my'>('all');
  const [filterType, setFilterType] = useState('all');
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellItem, setSellItem] = useState<any>(null);
  const [sellPrice, setSellPrice] = useState('');

  useEffect(() => {
    dispatch(fetchListings({ type: filterType }) as any);
    dispatch(fetchMyListings() as any);
    dispatch(fetchSoundTide() as any);
  }, [dispatch, filterType]);

  const handleBuy = (listingId: string) => {
    dispatch(buyListing(listingId) as any).then(() => {
      dispatch(fetchListings({ type: filterType }) as any);
      dispatch(fetchMyListings() as any);
    });
  };

  const handleCancel = (listingId: string) => {
    dispatch(cancelListing(listingId) as any).then(() => {
      dispatch(fetchListings({ type: filterType }) as any);
      dispatch(fetchMyListings() as any);
    });
  };

  const openSellModal = (item: any, type: string) => {
    setSellItem({ ...item, type });
    setSellPrice('');
    setShowSellModal(true);
  };

  const handleSell = () => {
    if (!sellItem || !sellPrice) return;
    
    const price = parseInt(sellPrice);
    if (isNaN(price) || price <= 0) return;
    
    let itemData = {};
    let itemId = sellItem.id;
    
    if (sellItem.type === 'material') {
      itemData = {
        material_id: sellItem.material_id,
        name: sellItem.name,
        quantity: 1,
        rarity: sellItem.rarity,
        quality: sellItem.quality
      };
      itemId = sellItem.material_id;
    } else {
      itemData = {
        tier: sellItem.tier,
        rarity: sellItem.rarity,
        quality: sellItem.quality
      };
    }
    
    dispatch(createListing({
      itemType: sellItem.type,
      itemId,
      price,
      itemData
    }) as any).then(() => {
      setShowSellModal(false);
      dispatch(fetchListings({ type: filterType }) as any);
      dispatch(fetchMyListings() as any);
    });
  };

  const displayListings = activeTab === 'all' ? listings : myListings;

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
            全部商品
          </div>
          <div 
            className={`tab ${activeTab === 'my' ? 'active' : ''}`}
            onClick={() => setActiveTab('my')}
          >
            我的上架
          </div>
        </div>
        
        <div className="filters">
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">全部类型</option>
            <option value="material">材料</option>
            <option value="detector">探测器</option>
          </select>
        </div>
      </div>

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
              </div>
              
              <div className="listing-footer">
                <div className="seller-info">
                  <span className="seller-name">{listing.seller_name}</span>
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
                    disabled={player?.gold < listing.price}
                  >
                    购买
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

      {showSellModal && (
        <div className="modal-overlay" onClick={() => setShowSellModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>出售商品</h3>
            <div className="sell-item-info">
              <span className="item-name">{sellItem?.name}</span>
              <span className="item-rarity" style={{ color: RARITY_COLORS[sellItem?.rarity] }}>
                {RARITY_NAMES[sellItem?.rarity]}
              </span>
            </div>
            
            <div className="form-group">
              <label>出售价格 (金币)</label>
              <input
                type="number"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder="请输入价格"
              />
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
