import { render, screen } from '@/test/render';

import { ExerciseThumbnail } from './exercise-thumbnail';

jest.mock('./photos', () => ({
  usePictureUrls: (paths: string[]) =>
    Object.fromEntries(paths.map((path) => [path, `https://photos.test/${path}`])),
}));

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const SQUAT = {
  primaryMuscles: ['quadriceps' as const],
  secondaryMuscles: ['glutes' as const],
  imagePaths: [],
};
/** The maps drawn; they are pictures, hidden from screen readers. */
const maps = () => screen.queryAllByTestId(/^muscle-map-/, { includeHiddenElements: true });
const images = () => screen.container.queryAll((node) => node.type === 'Image');

describe('ExerciseThumbnail', () => {
  it('shows the part of the body the exercise trains', async () => {
    await render(<ExerciseThumbnail exercise={SQUAT} size={60} name="Squat" />);
    // The thighs from the front, inside the frame's border.
    expect(
      screen.getByTestId('muscle-map-front-legs', { includeHiddenElements: true }),
    ).toHaveStyle({ width: 58, height: 58 });
    expect(images()).toHaveLength(0);
    expect(screen.queryByText('S')).toBeNull();
  });

  it("shows the photo of the user's own exercise, and no map", async () => {
    const mine = { ...SQUAT, imagePaths: [null, 'u/end.jpg'] };
    await render(<ExerciseThumbnail exercise={mine} size={60} name="Squat" />);
    expect(images().map((image) => image.props.source)).toEqual([
      { uri: 'https://photos.test/u/end.jpg' },
    ]);
    expect(maps()).toHaveLength(0);
  });

  it("shows the map of the user's own exercise whose photos were removed", async () => {
    const mine = { ...SQUAT, imagePaths: [null, null] };
    await render(<ExerciseThumbnail exercise={mine} size={60} name="Squat" />);
    expect(maps()).toHaveLength(1);
    expect(images()).toHaveLength(0);
  });

  it('shows the first letter of an exercise that is not in the library', async () => {
    await render(<ExerciseThumbnail exercise={undefined} size={60} name="squat" />);
    expect(screen.getByText('S')).toBeTruthy();
    expect(maps()).toHaveLength(0);
  });

  it('shows nothing without an exercise and a name', async () => {
    await render(<ExerciseThumbnail exercise={undefined} size={60} />);
    expect(maps()).toHaveLength(0);
    expect(images()).toHaveLength(0);
  });
});
