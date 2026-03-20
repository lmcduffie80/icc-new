import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from '@/components/admin/stat-card';
import { DollarSign } from 'lucide-react';

describe('StatCard component', () => {
  const defaultProps = {
    title: 'Total Revenue',
    value: '$12,345',
    icon: <DollarSign className="h-6 w-6" />,
  };

  describe('rendering', () => {
    it('should render title correctly', () => {
      render(<StatCard {...defaultProps} />);
      
      expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    });

    it('should render value correctly', () => {
      render(<StatCard {...defaultProps} />);
      
      expect(screen.getByText('$12,345')).toBeInTheDocument();
    });

    it('should render numeric value', () => {
      render(<StatCard {...defaultProps} value={42} />);
      
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('should render string value', () => {
      render(<StatCard {...defaultProps} value="1.2K" />);
      
      expect(screen.getByText('1.2K')).toBeInTheDocument();
    });

    it('should render icon', () => {
      const { container } = render(<StatCard {...defaultProps} />);
      
      // Check if icon container exists
      const iconContainer = container.querySelector('.bg-emerald-50');
      expect(iconContainer).toBeInTheDocument();
    });
  });

  describe('trends', () => {
    it('should render positive trend correctly', () => {
      render(
        <StatCard
          {...defaultProps}
          trend={{ value: 12.5, label: 'vs last month' }}
        />
      );
      
      expect(screen.getByText('+12.5%')).toBeInTheDocument();
      expect(screen.getByText('vs last month')).toBeInTheDocument();
    });

    it('should render negative trend correctly', () => {
      render(
        <StatCard
          {...defaultProps}
          trend={{ value: -8.3, label: 'vs last month' }}
        />
      );
      
      expect(screen.getByText('-8.3%')).toBeInTheDocument();
      expect(screen.getByText('vs last month')).toBeInTheDocument();
    });

    it('should render zero trend as positive', () => {
      render(
        <StatCard
          {...defaultProps}
          trend={{ value: 0, label: 'no change' }}
        />
      );
      
      expect(screen.getByText('+0%')).toBeInTheDocument();
      expect(screen.getByText('no change')).toBeInTheDocument();
    });

    it('should not render trend when not provided', () => {
      render(<StatCard {...defaultProps} />);
      
      expect(screen.queryByText('vs last month')).not.toBeInTheDocument();
    });

    it('should have correct color for positive trend', () => {
      render(
        <StatCard
          {...defaultProps}
          trend={{ value: 15, label: 'vs last month' }}
        />
      );
      
      const trendValue = screen.getByText('+15%');
      expect(trendValue).toHaveClass('text-emerald-600');
    });

    it('should have correct color for negative trend', () => {
      render(
        <StatCard
          {...defaultProps}
          trend={{ value: -10, label: 'vs last month' }}
        />
      );
      
      const trendValue = screen.getByText('-10%');
      expect(trendValue).toHaveClass('text-red-600');
    });
  });

  describe('styling', () => {
    it('should have default card styles', () => {
      const { container } = render(<StatCard {...defaultProps} />);
      
      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('rounded-xl');
      expect(card).toHaveClass('border');
      expect(card).toHaveClass('bg-white');
    });

    it('should apply custom className', () => {
      const { container } = render(
        <StatCard {...defaultProps} className="custom-stat-card" />
      );
      
      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('custom-stat-card');
    });

    it('should merge custom className with default classes', () => {
      const { container } = render(
        <StatCard {...defaultProps} className="shadow-lg" />
      );
      
      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('shadow-lg');
      expect(card).toHaveClass('rounded-xl');
    });

    it('should have proper title styling', () => {
      render(<StatCard {...defaultProps} />);
      
      const title = screen.getByText('Total Revenue');
      expect(title).toHaveClass('text-sm');
      expect(title).toHaveClass('font-medium');
      expect(title).toHaveClass('text-slate-500');
    });

    it('should have proper value styling', () => {
      render(<StatCard {...defaultProps} />);
      
      const value = screen.getByText('$12,345');
      expect(value).toHaveClass('text-3xl');
      expect(value).toHaveClass('font-semibold');
      expect(value).toHaveClass('text-slate-900');
    });
  });

  describe('layout', () => {
    it('should have flex layout with proper spacing', () => {
      const { container } = render(<StatCard {...defaultProps} />);
      
      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('p-6');
      
      const flexContainer = card.firstChild as HTMLElement;
      expect(flexContainer).toHaveClass('flex');
      expect(flexContainer).toHaveClass('items-start');
      expect(flexContainer).toHaveClass('justify-between');
    });

    it('should render icon on the right side', () => {
      const { container } = render(<StatCard {...defaultProps} />);
      
      const iconContainer = container.querySelector('.bg-emerald-50');
      expect(iconContainer).toHaveClass('rounded-lg');
      expect(iconContainer).toHaveClass('p-3');
    });
  });

  describe('different metrics', () => {
    it('should render revenue stat', () => {
      render(
        <StatCard
          title="Revenue"
          value="$45,231"
          icon={<DollarSign />}
          trend={{ value: 20.1, label: 'from last month' }}
        />
      );
      
      expect(screen.getByText('Revenue')).toBeInTheDocument();
      expect(screen.getByText('$45,231')).toBeInTheDocument();
      expect(screen.getByText('+20.1%')).toBeInTheDocument();
    });

    it('should render users stat', () => {
      render(
        <StatCard
          title="Active Users"
          value={2350}
          icon={<span>👥</span>}
          trend={{ value: 180.1, label: 'from last month' }}
        />
      );
      
      expect(screen.getByText('Active Users')).toBeInTheDocument();
      expect(screen.getByText('2350')).toBeInTheDocument();
      expect(screen.getByText('+180.1%')).toBeInTheDocument();
    });

    it('should render orders stat', () => {
      render(
        <StatCard
          title="Orders"
          value={145}
          icon={<span>📦</span>}
          trend={{ value: -12, label: 'from last week' }}
        />
      );
      
      expect(screen.getByText('Orders')).toBeInTheDocument();
      expect(screen.getByText('145')).toBeInTheDocument();
      expect(screen.getByText('-12%')).toBeInTheDocument();
      expect(screen.getByText('from last week')).toBeInTheDocument();
    });
  });

  describe('complex values', () => {
    it('should handle large numbers', () => {
      render(<StatCard {...defaultProps} value="$1,234,567.89" />);
      
      expect(screen.getByText('$1,234,567.89')).toBeInTheDocument();
    });

    it('should handle abbreviated values', () => {
      render(<StatCard {...defaultProps} value="2.5M" />);
      
      expect(screen.getByText('2.5M')).toBeInTheDocument();
    });

    it('should handle percentage values', () => {
      render(<StatCard {...defaultProps} value="95.2%" />);
      
      expect(screen.getByText('95.2%')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have semantic HTML structure', () => {
      const { container } = render(<StatCard {...defaultProps} />);
      
      const card = container.firstChild;
      expect(card).toBeInTheDocument();
    });

    it('should render text content readable by screen readers', () => {
      render(
        <StatCard
          title="Total Sales"
          value="$50,000"
          icon={<DollarSign />}
          trend={{ value: 10, label: 'from yesterday' }}
        />
      );
      
      // All text should be accessible
      expect(screen.getByText('Total Sales')).toBeVisible();
      expect(screen.getByText('$50,000')).toBeVisible();
      expect(screen.getByText('+10%')).toBeVisible();
      expect(screen.getByText('from yesterday')).toBeVisible();
    });
  });
});

