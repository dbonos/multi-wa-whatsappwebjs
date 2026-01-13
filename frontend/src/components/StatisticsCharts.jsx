import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export function ResponseTimeChart({ data, periods }) {
  const chartData = periods.map((period, index) => {
    const stat = data[index] || {};
    return {
      period: period.label,
      'New Customer': stat.new_customer?.avg_response_time_minutes || 0,
      'Previous Customer': stat.previous_customer?.avg_response_time_minutes || 0,
    };
  });

  return (
    <div className="card p-4">
      <h3 className="text-lg font-semibold mb-4">Average Response Time (Minutes)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" />
          <YAxis label={{ value: 'Minutes', angle: -90, position: 'insideLeft' }} />
          <Tooltip
            formatter={(value, name) => {
              const minutes = Math.floor(value);
              const seconds = Math.round((value - minutes) * 60);
              return `${minutes} menit ${seconds} detik`;
            }}
          />
          <Legend />
          <Line type="monotone" dataKey="New Customer" stroke="#25D366" strokeWidth={2} />
          <Line type="monotone" dataKey="Previous Customer" stroke="#128C7E" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CustomerCountChart({ data, periods }) {
  const chartData = periods.map((period, index) => {
    const stat = data[index] || {};
    return {
      period: period.label,
      'New Customer': stat.new_customer?.count || 0,
      'Previous Customer': stat.previous_customer?.count || 0,
      'New Customer (Tidak Dibalas)': stat.new_customer?.unreplied_count || 0,
      'Previous Customer (Tidak Dibalas)': stat.previous_customer?.unreplied_count || 0,
    };
  });

  return (
    <div className="card p-4">
      <h3 className="text-lg font-semibold mb-4">Customer Count</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" />
          <YAxis label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="New Customer" fill="#25D366" />
          <Bar dataKey="Previous Customer" fill="#128C7E" />
          <Bar dataKey="New Customer (Tidak Dibalas)" fill="#FF6B6B" />
          <Bar dataKey="Previous Customer (Tidak Dibalas)" fill="#FF8787" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PeriodComparisonChart({ data, periods }) {
  const chartData = periods.map((period, index) => {
    const stat = data[index] || {};
    return {
      period: period.label,
      'New Customer (min)': stat.new_customer?.avg_response_time_minutes || 0,
      'Previous Customer (min)': stat.previous_customer?.avg_response_time_minutes || 0,
      'New Customer Count': stat.new_customer?.count || 0,
      'Previous Customer Count': stat.previous_customer?.count || 0,
      'New Customer (Tidak Dibalas)': stat.new_customer?.unreplied_count || 0,
      'Previous Customer (Tidak Dibalas)': stat.previous_customer?.unreplied_count || 0,
    };
  });

  return (
    <div className="card p-4">
      <h3 className="text-lg font-semibold mb-4">Period Comparison</h3>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" />
          <YAxis yAxisId="left" label={{ value: 'Response Time (min)', angle: -90, position: 'insideLeft' }} />
          <YAxis yAxisId="right" orientation="right" label={{ value: 'Count', angle: 90, position: 'insideRight' }} />
          <Tooltip
            formatter={(value, name) => {
              if (name.includes('min')) {
                const minutes = Math.floor(value);
                const seconds = Math.round((value - minutes) * 60);
                return `${minutes} menit ${seconds} detik`;
              }
              return value;
            }}
          />
          <Legend />
          <Bar yAxisId="left" dataKey="New Customer (min)" fill="#25D366" />
          <Bar yAxisId="left" dataKey="Previous Customer (min)" fill="#128C7E" />
          <Bar yAxisId="right" dataKey="New Customer Count" fill="#34B7F1" />
          <Bar yAxisId="right" dataKey="Previous Customer Count" fill="#075E54" />
          <Bar yAxisId="right" dataKey="New Customer (Tidak Dibalas)" fill="#FF6B6B" />
          <Bar yAxisId="right" dataKey="Previous Customer (Tidak Dibalas)" fill="#FF8787" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

