import { ScrollView, Text, TextInput } from 'react-native';

import { fireEvent, render, screen } from '@/test/render';

import { Screen } from './screen';

// The bar is not an accessibility element and has no label here, so it is found by its role prop.
const progressBars = () =>
  screen.container.queryAll((node) => node.props.accessibilityRole === 'progressbar');

describe('Screen', () => {
  it('shows its content and footer', async () => {
    await render(
      <Screen footer={<Text>Footer</Text>}>
        <Text>Content</Text>
      </Screen>,
    );
    expect(screen.getByText('Content')).toBeTruthy();
    expect(screen.getByText('Footer')).toBeTruthy();
  });

  it('has a back button that calls onBack', async () => {
    const onBack = jest.fn();
    await render(
      <Screen onBack={onBack}>
        <Text>Content</Text>
      </Screen>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('has a cross at the end that leaves a flow of steps, beside the back button', async () => {
    const onBack = jest.fn();
    const onClose = jest.fn();
    await render(
      <Screen
        onBack={onBack}
        onClose={onClose}
        progress={{ sections: ['One', 'Two'], current: 0, value: 1, overall: 0.5 }}
      >
        <Text>Content</Text>
      </Screen>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  it('shows a progress bar only when given progress', async () => {
    await render(
      <Screen>
        <Text>Content</Text>
      </Screen>,
    );
    expect(progressBars()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    await screen.rerender(
      <Screen progress={{ sections: ['One', 'Two'], current: 1, value: 0, overall: 0.5 }}>
        <Text>Content</Text>
      </Screen>,
    );
    expect(progressBars()).toHaveLength(1);
    expect(progressBars()[0]).toHaveAccessibilityValue({ now: 50 });
  });

  it('shows a text title as the header, with a line under it', async () => {
    await render(
      <Screen onBack={() => {}} title="Breakfast" subtitle="Today · Tue, Oct 27">
        <Text>Body</Text>
      </Screen>,
    );
    expect(screen.getByRole('header', { name: 'Breakfast' })).toBeTruthy();
    expect(screen.getByText('Today · Tue, Oct 27')).toBeTruthy();
  });

  it('makes a title larger on its own, shrinking a long one to fit on one line', async () => {
    await render(
      <Screen onBack={() => {}} title="Add to breakfast">
        <Text>Body</Text>
      </Screen>,
    );
    const title = screen.getByRole('header', { name: 'Add to breakfast' });
    expect(title).toHaveStyle({ fontSize: 20 });
    expect(title.props.adjustsFontSizeToFit).toBe(true);
    expect(title.props.minimumFontScale).toBe(0.8);
  });

  it('keeps a title with a line under it at the smaller size', async () => {
    await render(
      <Screen onBack={() => {}} title="Breakfast" subtitle="Today · Tue, Oct 27">
        <Text>Body</Text>
      </Screen>,
    );
    expect(screen.getByRole('header', { name: 'Breakfast' })).toHaveStyle({ fontSize: 16 });
  });

  it('keeps an empty text title in the middle, balanced against the back button', async () => {
    await render(
      <Screen onBack={() => {}} title="" subtitle="History">
        <Text>Body</Text>
      </Screen>,
    );
    // The back button, and the spacer of its width at the other end of the bar.
    const sides = screen.container.queryAll(
      (node) => node.type === 'View' && node.props.style?.width === 44,
    );
    expect(sides.length).toBeGreaterThanOrEqual(2);
  });

  describe('with the focused field kept in view', () => {
    // The mocked ScrollView's methods, shared through its prototype.
    const scrollView = ScrollView.prototype as unknown as {
      getInnerViewRef: jest.Mock;
      scrollTo: jest.Mock;
    };
    const scrollBox = () => {
      const [box] = screen.container.queryAll((node) => node.type === 'RCTScrollView');
      if (!box) {
        throw new Error('No scroll view');
      }
      return box;
    };

    /** A focused field at `top`, 50 points tall, or one outside the scroll view. */
    function focusField(top: number | null) {
      jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue({
        measureLayout: (
          _content: unknown,
          onSuccess: (x: number, y: number, width: number, height: number) => void,
          onFail: () => void,
        ) => (top === null ? onFail() : onSuccess(0, top, 300, 50)),
      } as never);
    }

    async function renderForm(keepsFocusedFieldInView = true) {
      await render(
        <Screen footer={<Text>Footer</Text>} keepsFocusedFieldInView={keepsFocusedFieldInView}>
          <Text>Content</Text>
        </Screen>,
      );
    }

    beforeEach(() => {
      scrollView.getInnerViewRef.mockReturnValue({});
      scrollView.scrollTo.mockClear();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('scrolls a field the smaller form hides into view, with a margin', async () => {
      await renderForm();
      focusField(400);
      await fireEvent(scrollBox(), 'layout', { nativeEvent: { layout: { height: 200 } } });
      // Its bottom at 450, a margin of 16 below it, in 200 points of the form.
      expect(scrollView.scrollTo).toHaveBeenCalledWith({ y: 266, animated: true });
    });

    it('leaves a field already in view, and one outside the form', async () => {
      await renderForm();
      focusField(40);
      await fireEvent(scrollBox(), 'layout', { nativeEvent: { layout: { height: 200 } } });
      focusField(null);
      await fireEvent(scrollBox(), 'layout', { nativeEvent: { layout: { height: 100 } } });
      expect(scrollView.scrollTo).not.toHaveBeenCalled();
    });

    it('is off unless the screen asks for it', async () => {
      await renderForm(false);
      expect(scrollBox().props.onLayout).toBeUndefined();
    });
  });
});
