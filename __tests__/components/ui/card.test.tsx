import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

describe('Card components', () => {
  describe('Card', () => {
    it('should render children correctly', () => {
      render(
        <Card>
          <div>Card Content</div>
        </Card>
      );
      
      expect(screen.getByText('Card Content')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      const { container } = render(<Card>Content</Card>);
      
      const card = container.querySelector('[data-slot="card"]');
      expect(card).toBeInTheDocument();
    });

    it('should have default card classes', () => {
      const { container } = render(<Card>Content</Card>);
      
      const card = container.querySelector('[data-slot="card"]');
      expect(card).toHaveClass('bg-card');
      expect(card).toHaveClass('rounded-xl');
      expect(card).toHaveClass('border');
    });

    it('should apply custom className', () => {
      const { container } = render(<Card className="custom-card">Content</Card>);
      
      const card = container.querySelector('[data-slot="card"]');
      expect(card).toHaveClass('custom-card');
    });

    it('should merge custom className with default classes', () => {
      const { container } = render(<Card className="p-8">Content</Card>);
      
      const card = container.querySelector('[data-slot="card"]');
      expect(card).toHaveClass('p-8');
      expect(card).toHaveClass('rounded-xl');
    });
  });

  describe('CardHeader', () => {
    it('should render children correctly', () => {
      render(
        <CardHeader>
          <div>Header Content</div>
        </CardHeader>
      );
      
      expect(screen.getByText('Header Content')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      const { container } = render(<CardHeader>Content</CardHeader>);
      
      const header = container.querySelector('[data-slot="card-header"]');
      expect(header).toBeInTheDocument();
    });

    it('should have grid layout classes', () => {
      const { container } = render(<CardHeader>Content</CardHeader>);
      
      const header = container.querySelector('[data-slot="card-header"]');
      expect(header).toHaveClass('grid');
      expect(header).toHaveClass('px-6');
    });
  });

  describe('CardTitle', () => {
    it('should render children correctly', () => {
      render(<CardTitle>My Card Title</CardTitle>);
      
      expect(screen.getByText('My Card Title')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      const { container } = render(<CardTitle>Title</CardTitle>);
      
      const title = container.querySelector('[data-slot="card-title"]');
      expect(title).toBeInTheDocument();
    });

    it('should have font styling classes', () => {
      const { container } = render(<CardTitle>Title</CardTitle>);
      
      const title = container.querySelector('[data-slot="card-title"]');
      expect(title).toHaveClass('font-semibold');
      expect(title).toHaveClass('leading-none');
    });
  });

  describe('CardDescription', () => {
    it('should render children correctly', () => {
      render(<CardDescription>This is a description</CardDescription>);
      
      expect(screen.getByText('This is a description')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      const { container } = render(<CardDescription>Description</CardDescription>);
      
      const desc = container.querySelector('[data-slot="card-description"]');
      expect(desc).toBeInTheDocument();
    });

    it('should have muted text styling', () => {
      const { container } = render(<CardDescription>Description</CardDescription>);
      
      const desc = container.querySelector('[data-slot="card-description"]');
      expect(desc).toHaveClass('text-muted-foreground');
      expect(desc).toHaveClass('text-sm');
    });
  });

  describe('CardAction', () => {
    it('should render children correctly', () => {
      render(
        <CardAction>
          <button>Action</button>
        </CardAction>
      );
      
      expect(screen.getByRole('button', { name: /action/i })).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      const { container } = render(<CardAction>Action</CardAction>);
      
      const action = container.querySelector('[data-slot="card-action"]');
      expect(action).toBeInTheDocument();
    });

    it('should have positioning classes', () => {
      const { container } = render(<CardAction>Action</CardAction>);
      
      const action = container.querySelector('[data-slot="card-action"]');
      expect(action).toHaveClass('col-start-2');
      expect(action).toHaveClass('row-span-2');
      expect(action).toHaveClass('justify-self-end');
    });
  });

  describe('CardContent', () => {
    it('should render children correctly', () => {
      render(
        <CardContent>
          <p>Main content goes here</p>
        </CardContent>
      );
      
      expect(screen.getByText('Main content goes here')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      const { container } = render(<CardContent>Content</CardContent>);
      
      const content = container.querySelector('[data-slot="card-content"]');
      expect(content).toBeInTheDocument();
    });

    it('should have padding classes', () => {
      const { container } = render(<CardContent>Content</CardContent>);
      
      const content = container.querySelector('[data-slot="card-content"]');
      expect(content).toHaveClass('px-6');
    });
  });

  describe('CardFooter', () => {
    it('should render children correctly', () => {
      render(
        <CardFooter>
          <button>Save</button>
        </CardFooter>
      );
      
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      const { container } = render(<CardFooter>Footer</CardFooter>);
      
      const footer = container.querySelector('[data-slot="card-footer"]');
      expect(footer).toBeInTheDocument();
    });

    it('should have flex layout classes', () => {
      const { container } = render(<CardFooter>Footer</CardFooter>);
      
      const footer = container.querySelector('[data-slot="card-footer"]');
      expect(footer).toHaveClass('flex');
      expect(footer).toHaveClass('items-center');
      expect(footer).toHaveClass('px-6');
    });
  });

  describe('Full Card composition', () => {
    it('should render a complete card with all components', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
            <CardDescription>Card Description</CardDescription>
            <CardAction>
              <button>Edit</button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <p>This is the main content</p>
          </CardContent>
          <CardFooter>
            <button>Cancel</button>
            <button>Submit</button>
          </CardFooter>
        </Card>
      );
      
      expect(screen.getByText('Card Title')).toBeInTheDocument();
      expect(screen.getByText('Card Description')).toBeInTheDocument();
      expect(screen.getByText('This is the main content')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    });
  });
});

