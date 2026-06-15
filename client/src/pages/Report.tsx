import React, { useEffect, useState, useRef } from 'react';
import { Chart as ChartJS, registerables } from 'chart.js';
import { Line, Bar, Radar, Doughnut } from 'react-chartjs-2';
import api from '../services/api';
import './Report.scss';

ChartJS.register(...registerables);

const Report: React.FC = () => {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    try {
      const response = await api.get('/report/current');
      setReport(response.data);
    } catch (error) {
      console.error('获取报告失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = () => {
    window.open('http://localhost:4000/api/report/export/pdf', '_blank');
  };

  const rarityChartData = {
    labels: report?.summary?.detectorByRarity?.map((d: any) => {
      const names: Record<string, string> = {
        common: '普通',
        uncommon: '优秀',
        rare: '稀有',
        epic: '史诗',
        legendary: '传说'
      };
      return names[d.rarity] || d.rarity;
    }) || [],
    datasets: [{
      label: '数量',
      data: report?.summary?.detectorByRarity?.map((d: any) => d.count) || [],
      backgroundColor: [
        '#95a5a6',
        '#27ae60',
        '#3498db',
        '#9b59b6',
        '#f39c12'
      ],
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

  const radarData = {
    labels: ['探测范围', '精度', '品质', '稀有度', '词缀数', '收藏价值'],
    datasets: [{
      label: '本周平均',
      data: [65, 55, 50, 40, 30, 45],
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
    labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    datasets: [
      {
        label: '声波水晶',
        data: [50, 55, 52, 58, 62, 68, 65],
        borderColor: '#3498db',
        backgroundColor: 'rgba(52, 152, 219, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: '共鸣器',
        data: [30, 32, 35, 33, 36, 40, 38],
        borderColor: '#e74c3c',
        backgroundColor: 'rgba(231, 76, 60, 0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  const chartOptions = {
    responsive: true,
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
    scales: {
      r: {
        angleLines: { color: 'rgba(45, 45, 77, 0.5)' },
        grid: { color: 'rgba(45, 45, 77, 0.5)' },
        pointLabels: { color: '#a0a0c0' },
        ticks: { color: '#6c6c8c', backdropColor: 'transparent' }
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
    plugins: {
      legend: {
        position: 'right' as const,
        labels: { color: '#a0a0c0' }
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
          <p className="report-subtitle">第 {report?.weekNumber} 周 · {report?.year}年</p>
        </div>
        <button className="export-btn" onClick={handleExportPDF}>
          📄 导出PDF
        </button>
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
          <div className="chart-container">
            <Doughnut data={rarityChartData} options={doughnutOptions} />
          </div>
        </div>

        <div className="chart-card">
          <h3>📈 材料使用率排行</h3>
          <div className="chart-container">
            <Bar data={materialsChartData} options={chartOptions} />
          </div>
        </div>

        <div className="chart-card wide">
          <h3>📡 探测器属性雷达图</h3>
          <div className="chart-container radar">
            <Radar data={radarData} options={radarOptions} />
          </div>
        </div>

        <div className="chart-card wide">
          <h3>💹 价格走势</h3>
          <div className="chart-container">
            <Line data={priceTrendData} options={chartOptions} />
          </div>
        </div>
      </div>

      <div className="top-detectors">
        <h3>🏆 本周最佳探测器</h3>
        <div className="detector-list">
          {report?.topDetectors?.slice(0, 5)?.map((detector: any, index: number) => (
            <div key={detector.id} className="detector-item">
              <span className="detector-rank">#{index + 1}</span>
              <div className="detector-info">
                <span className="detector-name">{detector.name}</span>
                <span className="detector-owner">by {detector.nickname}</span>
              </div>
              <span className="detector-quality">
                品质: {detector.quality}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Report;
