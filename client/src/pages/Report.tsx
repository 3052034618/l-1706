import React, { useEffect, useState, useCallback } from 'react';
import { Chart as ChartJS, registerables } from 'chart.js';
import { Line, Bar, Radar, Doughnut } from 'react-chartjs-2';
import api from '../services/api';
import { RARITY_COLORS, RARITY_NAMES } from '../utils/constants';
import './Report.scss';

ChartJS.register(...registerables);

const Report: React.FC = () => {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/report/current');
      setReport(response.data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('获取报告失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExportPDF = () => {
    const token = localStorage.getItem('token');
    window.open(`http://localhost:4000/api/report/export/pdf?token=${token}`, '_blank');
  };

  const handleRefresh = () => {
    fetchReport();
  };

  const rarityChartData = {
    labels: report?.summary?.detectorByRarity?.map((d: any) => RARITY_NAMES[d.rarity] || d.rarity) || [],
    datasets: [{
      label: '数量',
      data: report?.summary?.detectorByRarity?.map((d: any) => d.count) || [],
      backgroundColor: report?.summary?.detectorByRarity?.map((d: any) => RARITY_COLORS[d.rarity] || '#999') || [],
      borderWidth: 0
    }]
  };

  const materialsChartData = {
    labels: report?.topMaterials?.slice(0, 8)?.map((m: any) => m.name) || [],
    datasets: [{
      label: '使用次数',
      data: report?.topMaterials?.slice(0, 8)?.map((m: any) => m.times_used) || [],
      backgroundColor: 'rgba(108, 92, 231, 0.6)',
      borderColor: '#6c5ce7',
      borderWidth: 2,
      borderRadius: 6
    }]
  };

  const radarChartData = {
    labels: report?.radarData?.labels || ['探测范围', '精度', '品质', '稀有度', '词缀数', '收藏价值'],
    datasets: [{
      label: '本周平均',
      data: report?.radarData?.values || [0, 0, 0, 0, 0, 0],
      fill: true,
      backgroundColor: 'rgba(108, 92, 231, 0.2)',
      borderColor: '#6c5ce7',
      pointBackgroundColor: '#6c5ce7',
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: '#6c5ce7'
    }]
  };

  const priceTrendData = {
    labels: report?.dailyPriceData?.labels || ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    datasets: (report?.dailyPriceData?.datasets || []).map((dataset: any, index: number) => ({
      label: dataset.name,
      data: dataset.data,
      borderColor: dataset.color,
      backgroundColor: dataset.color + '20',
      fill: true,
      tension: 0.4
    }))
  };

  const contestScoreData = {
    labels: report?.contestScoreHistory?.labels || [],
    datasets: [
      {
        label: '平均分数',
        data: report?.contestScoreHistory?.scores || [],
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.1)',
        fill: true,
        tension: 0.4,
        yAxisID: 'y'
      },
      {
        label: '参赛人数',
        data: report?.contestScoreHistory?.entries || [],
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: false,
        tension: 0.4,
        yAxisID: 'y1'
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#a0a0c0'
        }
      }
    },
    scales: {
      x: {
        ticks: { color: '#6c6c8c' },
        grid: { color: 'rgba(45, 45, 77, 0.5)' }
      },
      y: {
        ticks: { color: '#6c6c8c' },
        grid: { color: 'rgba(45, 45, 77, 0.5)' }
      }
    }
  };

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        angleLines: { color: 'rgba(45, 45, 77, 0.5)' },
        grid: { color: 'rgba(45, 45, 77, 0.5)' },
        pointLabels: { color: '#a0a0c0' },
        ticks: { color: '#6c6c8c', backdropColor: 'transparent', display: false },
        suggestedMin: 0,
        suggestedMax: 100
      }
    },
    plugins: {
      legend: {
        labels: { color: '#a0a0c0' }
      }
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
        labels: { color: '#a0a0c0' }
      }
    }
  };

  const dualAxisOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: '#a0a0c0' }
      }
    },
    scales: {
      x: {
        ticks: { color: '#6c6c8c' },
        grid: { color: 'rgba(45, 45, 77, 0.5)' }
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left' as const,
        ticks: { color: '#6c6c8c' },
        grid: { color: 'rgba(45, 45, 77, 0.5)' },
        title: {
          display: true,
          text: '平均分数',
          color: '#667eea'
        }
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right' as const,
        ticks: { color: '#6c6c8c' },
        grid: { drawOnChartArea: false },
        title: {
          display: true,
          text: '参赛人数',
          color: '#10b981'
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="report-page loading">
        <div className="loading-spinner"></div>
        <p>加载产业报告中...</p>
      </div>
    );
  }

  return (
    <div className="report-page">
      <div className="report-header">
        <div>
          <h2>📊 产业报告</h2>
          <p className="report-subtitle">
            第 {report?.weekNumber} 周 · {report?.year}年
            {lastUpdate && <span className="last-update"> · 更新于 {lastUpdate.toLocaleTimeString()}</span>}
          </p>
        </div>
        <div className="header-actions">
          <button className="refresh-btn" onClick={handleRefresh}>
            🔄 刷新
          </button>
          <button className="export-btn" onClick={handleExportPDF}>
            📄 导出PDF
          </button>
        </div>
      </div>

      <div className="stats-cards">
        <div className="stat-card">
          <span className="stat-icon">🔧</span>
          <div className="stat-info">
            <span className="stat-value">{report?.summary?.totalCrafting || 0}</span>
            <span className="stat-label">总制作次数</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🔮</span>
          <div className="stat-info">
            <span className="stat-value">{report?.summary?.totalDetectors || 0}</span>
            <span className="stat-label">产出探测器</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🏆</span>
          <div className="stat-info">
            <span className="stat-value">{report?.summary?.totalContestEntries || 0}</span>
            <span className="stat-label">大赛参赛数</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">💰</span>
          <div className="stat-info">
            <span className="stat-value">{(report?.summary?.totalVolume || 0).toLocaleString()}</span>
            <span className="stat-label">交易总额</span>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>🎯 探测器品质分布</h3>
          <div className="chart-container small">
            {report?.summary?.detectorByRarity?.length > 0 ? (
              <Doughnut data={rarityChartData} options={doughnutOptions} />
            ) : (
              <div className="empty-chart">暂无数据</div>
            )}
          </div>
        </div>

        <div className="chart-card">
          <h3>📈 材料使用率排行</h3>
          <div className="chart-container small">
            {report?.topMaterials?.length > 0 ? (
              <Bar data={materialsChartData} options={chartOptions} />
            ) : (
              <div className="empty-chart">暂无数据</div>
            )}
          </div>
        </div>

        <div className="chart-card wide">
          <h3>📡 探测器属性雷达图</h3>
          <div className="chart-container radar">
            {report?.radarData ? (
              <Radar data={radarChartData} options={radarOptions} />
            ) : (
              <div className="empty-chart">暂无数据</div>
            )}
          </div>
        </div>

        <div className="chart-card wide">
          <h3>💹 价格走势</h3>
          <div className="chart-container">
            {report?.dailyPriceData?.datasets?.length > 0 ? (
              <Line data={priceTrendData} options={chartOptions} />
            ) : (
              <div className="empty-chart">暂无交易数据</div>
            )}
          </div>
        </div>

        <div className="chart-card wide">
          <h3>🏆 大赛评分曲线</h3>
          <div className="chart-container">
            {report?.contestScoreHistory?.scores?.some((s: number) => s > 0) ? (
              <Line data={contestScoreData} options={dualAxisOptions} />
            ) : (
              <div className="empty-chart">暂无大赛数据</div>
            )}
          </div>
        </div>
      </div>

      <div className="top-detectors">
        <h3>🏆 本周最佳探测器</h3>
        <div className="detector-list">
          {report?.topDetectors?.slice(0, 5)?.map((detector: any, index: number) => (
            <div key={detector.id} className="detector-item">
              <span className={`detector-rank rank-${index + 1}`}>#{index + 1}</span>
              <div className="detector-info">
                <span 
                  className="detector-name"
                  style={{ color: RARITY_COLORS[detector.rarity] }}
                >
                  {detector.name}
                </span>
                <span className="detector-owner">by {detector.nickname}</span>
              </div>
              <div className="detector-stats">
                <span>品质: {detector.quality}</span>
                <span>范围: {detector.range}</span>
                <span>精度: {detector.precision}</span>
              </div>
            </div>
          ))}
          {(!report?.topDetectors || report.topDetectors.length === 0) && (
            <div className="empty-detectors">暂无数据</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Report;
