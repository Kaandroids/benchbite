-- The library's exercises no longer name pictures (#702, ADR 0163): the rights to the pictures
-- are not known, the app shows a muscle map in their place (ADR 0162), and the files are taken
-- out of the repository and the exercise-images bucket. Emptying the paths keeps a build that
-- still shows pictures from asking for files that are gone: it shows an exercise without
-- pictures. The column stays, for the photos of the users' own exercises (ADR 0027).
--
-- The bucket stays too, empty: storage refuses to have its tables deleted from by SQL, and an
-- empty bucket gives nothing away.
update public.exercises
set image_paths = '{}'
where owner_id is null
  and image_paths <> '{}';
