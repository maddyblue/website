---
title: "Survey of Rounding Implementations in Go"
date: 2017-07-06
---

_(Also published on the [Cockroach Labs Blog](https://www.cockroachlabs.com/blog/rounding-implementations-in-go/).)_

Rounding in Go is hard to do correctly. That is, given a `float64`, truncate the fractional part (anything right of the decimal point), and add one to the truncated value if the fractional part was >= 0.5. This problem doesn't come up often, but it does enough that as of this writing, the second hit on Google for `golang round` is a [closed issue](https://github.com/golang/go/issues/4594) from the Go project, which declined to add a Round function to the math package. That issue also includes many community contributions about ways to round.

In this blog post I'd like to examine those and other implementations of round and audit them for correctness. We will see that nearly all have bugs preventing use in production software. So to answer [a question](https://www.reddit.com/r/golang/comments/6kot5d/why_doesnt_math_package_contains_such_obvious/) that appeared while I was writing this blog post: round seems obvious, but is not.

## Surveying the options for round

There are multiple ways to round (away from zero, toward zero, half away from zero, half to even, etc.), depending on one's use case. Here we will discuss half away from zero, which rounds up if the fractional part is >= 0.5, and rounds down otherwise.

The requirements of a correct round implementation are that it:

1. rounds half away from zero for all finite inputs
2. supports special values (NaN, Inf, -0) by returning them unchanged

We will use the following test cases to verify correctness, where the second value is the desired result after rounding the first:

```
tests := [][2]float64{
	{-0.49999999999999994, negZero}, // -0.5+epsilon
	{-0.5, -1},
	{-0.5000000000000001, -1}, // -0.5-epsilon
	{0, 0},
	{0.49999999999999994, 0}, // 0.5-epsilon
	{0.5, 1},
	{0.5000000000000001, 1},                         // 0.5+epsilon
	{1.390671161567e-309, 0},                        // denormal
	{2.2517998136852485e+15, 2.251799813685249e+15}, // 1 bit fraction
	{4.503599627370497e+15, 4.503599627370497e+15},  // large integer
	{math.Inf(-1), math.Inf(-1)},
	{math.Inf(1), math.Inf(1)},
	{math.NaN(), math.NaN()},
	{negZero, negZero},
}
```

These include all the special cases, some normal cases, and some edge cases that will prove difficult for many algorithms to handle. (Note that since floats aren't exact, using `-0.49999999999999999` is the same as `0.5`. The value used here is the highest float < 0.5. Also, printing `-0.49999999999999994` at very high precision returns `-0.499999999999999944488848768742`.)

The suggestions in the linked issue were often (obviously) untested, but assumed to work, even when suggested by very well known people. That they don't work is a testament to how difficult rounding is to do correctly for all inputs.

### int(f + 0.5)

The first suggestion to the rounding issue comes from rsc:

```
return int(f + 0.5)
```

And fails with:

	round(-0.5): got: 0, want -1
	round(-0.5000000000000001): got: 0, want -1
	round(0.49999999999999994): got: 1, want 0
	round(4.503599627370497e+15): got: 4.503599627370498e+15, want 4.503599627370497e+15
	round(-Inf): got: -9.223372036854776e+18, want -Inf
	round(+Inf): got: -9.223372036854776e+18, want +Inf
	round(NaN): got: -9.223372036854776e+18, want NaN

It doesn't work with special values, negative numbers, inputs > math.MaxInt64 or inputs close to 0.5.

### Floor + 0.5

The second suggestion in the linked issue is:

```
if f < 0 {
	return math.Ceil(f - 0.5)
}
return math.Floor(f + 0.5)
```

And fails with:

	round(-0.49999999999999994): got: -1, want -0
	round(0.49999999999999994): got: 1, want 0
	round(4.503599627370497e+15): got: 4.503599627370498e+15, want 4.503599627370497e+15

What happened in the first two failures is the `n-0.5` computation resulted in `-1.0`, even though we expected something strictly > -1.0. If we look at the [round implementation of Postgres](https://github.com/postgres/postgres/blob/REL9_6_3/src/port/rint.c#L38) we can see they explicitly avoid this problem:

> Subtracting 0.5 from a number very close to -0.5 can round to exactly -1.0, producing incorrect results...

This is not an uncommon problem. Java up through version 6 [was broken in this way](https://stackoverflow.com/questions/9902968/why-does-math-round0-49999999999999994-return-1), but has since improved their implementation.

### int + Copysign

The third suggestion comes from minux, which is an attempt to fix the negative input problem:

```
return int(f + math.Copysign(0.5, f))
```

And fails with:

	round(-0.49999999999999994): got: -1, want -0
	round(0.49999999999999994): got: 1, want 0
	round(4.503599627370497e+15): got: 4.503599627370498e+15, want 4.503599627370497e+15
	round(-Inf): got: -9.223372036854776e+18, want -Inf
	round(+Inf): got: -9.223372036854776e+18, want +Inf
	round(NaN): got: -9.223372036854776e+18, want NaN

This fixed the negative input problem, but left the rest, and added a broken test that was working before (`-0.49999999999999994`). Another user attempted to fix that problem with:

```
if math.Abs(f) < 0.5 {
        return 0
}
return int(f + math.Copysign(0.5, f))
```

This fails with:

	round(4.503599627370497e+15): got: 4.503599627370498e+15, want 4.503599627370497e+15
	round(-Inf): got: -9.223372036854776e+18, want -Inf
	round(+Inf): got: -9.223372036854776e+18, want +Inf
	round(NaN): got: -9.223372036854776e+18, want NaN

Which is overall much better, but still doesn't handle specials or large inputs. Specials can easily be handled with some special cases, but the large inputs can't.

The count now is 4 suggestions, and all 4 are broken. Now we will begin to look at some implementations of round in various packages.

### Kubernetes

Kubernetes 1.7 has a [round implementation](https://github.com/kubernetes/kubernetes/blob/release-1.7/staging/src/k8s.io/client-go/util/integer/integer.go#L61):

```
if a < 0 {
	return int32(a - 0.5)
}
return int32(a + 0.5)
```

And fails with:

	round(-0.49999999999999994): got: -1, want -0
	round(0.49999999999999994): got: 1, want 0
	round(4.503599627370497e+15): got: 4.503599627370498e+15, want 4.503599627370497e+15
	round(-Inf): got: -9.223372036854776e+18, want -Inf
	round(+Inf): got: -9.223372036854776e+18, want +Inf
	round(NaN): got: -9.223372036854776e+18, want NaN

Since the return value of that function is an int32, we can assume they know their inputs may not ever be special or large, and ignore those inputs, but that still leaves the very close to 0.5 inputs that fail.

## Solutions that specify the rounding digit

Many people would like something that, in addition to normal float -> int round, can round to N digits: `round(12.345, 2) = 12.35`.

### strconv

There was a long [thread on golang-nuts](https://groups.google.com/forum/#!topic/golang-nuts/ITZV08gAugI/discussion) about rounding, and one of the popular solutions was to use strconv:

```
func RoundFloat(x float64, prec int) float64 {
	frep := strconv.FormatFloat(x, 'g', prec, 64)
	f, _ := strconv.ParseFloat(frep, 64)
	return f
}
```

This uses the 'g' format verb, which returns N digits total, not N digits after the decimal point. The test cases for that function were mostly less than 1, which is why it appeared to work, but it fails for general inputs.

### Multiply by 10^N

Many other solutions for this problem use an implementation that multiplies the input by 10^N (where N is the desired number of digits), rounds, then returns that number divided by 10^N. These algorithms have two kinds of problems. First, if N is sufficiently large, then it can overflow during the multiplication to Infinity. Second, it still has to round correctly, and that's hard to do as seen above.

For example, [github.com/a-h/round](https://github.com/a-h/round/blob/29d6cc75ad82cb7aee00b8789582c88ddb229e2a/awayfromzero.go) does both:

```
func AwayFromZero(v float64, decimals int) float64 {
	var pow float64 = 1
	for i := 0; i < decimals; i++ {
		pow *= 10
	}
	if v < 0 {
		return float64(int((v*pow)-0.5)) / pow
	}
	return float64(int((v*pow)+0.5)) / pow
}
```

Here it is trivial for `v*pow` to be greater than math.MaxInt64 (or MaxInt32 on 32-bit systems, as this converts to `int`), and cause problems. Even if it doesn't do that, we've already seen above that the `int(f - 0.5)` solution doesn't work for various cases.

Another example, [github.com/gonum/floats](https://github.com/gonum/floats/blob/a2cbc5c70616cd18491ef2843231f6ce28b2cb02/floats.go#L587) does something slightly different:

```
func Round(x float64, prec int) float64 {
	if x == 0 {
		// Make sure zero is returned
		// without the negative bit set.
		return 0
	}
	// Fast path for positive precision on integers.
	if prec >= 0 && x == math.Trunc(x) {
		return x
	}
	pow := math.Pow10(prec)
	intermed := x * pow
	if math.IsInf(intermed, 0) {
		return x
	}
	if x < 0 {
		x = math.Ceil(intermed - 0.5)
	} else {
		x = math.Floor(intermed + 0.5)
	}

	if x == 0 {
		return 0
	}

	return x / pow
}
```

See the line with `math.IsInf`. This function detects when multiplying by `10^N` will overflow, but it handles it by silently returning the input with no indication of error. Even when specifying 0 precision, it fails with:

	round(-0.49999999999999994): got: -1, want -0
	round(0.49999999999999994): got: 1, want 0

So still isn't usable.

### CockroachDB

This is [an old implementation](https://github.com/cockroachdb/cockroach/blob/6dda97425db887c0d7aab0b3e2eed9b8e0db16e3/pkg/sql/parser/builtins.go#L2085) from CockroachDB, before we used the Postgres algorithm. With comments removed:

```
func round(x float64, n int) {
	pow := math.Pow(10, float64(n))
	if math.Abs(x*pow) > 1e17 {
		return x
	}
	v, frac := math.Modf(x * pow)
	if x > 0.0 {
		if frac > 0.5 || (frac == 0.5 && uint64(v)%2 != 0) {
			v += 1.0
		}
	} else {
		if frac < -0.5 || (frac == -0.5 && uint64(v)%2 != 0) {
			v -= 1.0
		}
	}
	return v / pow
}
```

This works correctly for banker's rounding (discussed below), but uses some undefined behavior of Go. The conversion of v (a float64) to uint64 is not well defined and [works differently on amd64 and arm](https://github.com/cockroachdb/cockroach/commit/b8d1c9c8a206541ae590cac7c651f44de2623cde). While fixing the arm bug, CockroachDB decided to use a more tested algorithm, and consulted Postgres' approach.

## Working Implementations

Below are some working implementations in Go.

### Postgres (adapted from C to Go by CockroachDB)

The Postgres comment above is from a round implementation in C. CockroachDB [adopted this to Go](https://github.com/cockroachdb/cockroach/blob/cdfc68af81c962831033098551de3846e409cec1/pkg/sql/parser/builtins.go#L2320) (shown here with comments removed). It implements banker's rounding (round to even), and excluding that difference, it passes all tests.

```
func round(x float64) float64 {
	if math.IsNaN(x) {
		return x
	}
	if x == 0.0 {
		return x
	}
	roundFn := math.Ceil
	if math.Signbit(x) {
		roundFn = math.Floor
	}
	xOrig := x
	x -= math.Copysign(0.5, x)
	if x == 0 || math.Signbit(x) != math.Signbit(xOrig) {
		return math.Copysign(0.0, xOrig)
	}
	if x == xOrig-math.Copysign(1.0, x) {
		return xOrig
	}
	r := roundFn(x)
	if r != x {
		return r
	}
	return roundFn(x*0.5) * 2.0
}
```

Let's analyze how this works. The first 6 lines handle some special cases. The next 4 set `roundFn` to Ceil or Floor depending on whether the input is negative. The following line stores the original input. Now it gets interesting:

	x -= math.Copysign(0.5, x)

This moves `x` closer to zero by `0.5`.

	if x == 0 || math.Signbit(x) != math.Signbit(xOrig) {
		return math.Copysign(0.0, xOrig)
	}

Next it checks if `x` is equal to zero or went over zero to the other side (the sign change checking). If either of those happened, then the input was <= 0.5, so an appropriately signed zero is returned.

	if x == xOrig-math.Copysign(1.0, x) {
		return xOrig
	}

This tests for large inputs, for which `x-0.5 == x-1.0`, and returns the input unchanged.

	r := roundFn(x)
	if r != x {
		return r
	}

Next the ceil or floor func is executed and returned if it mutated the input, which can only happen if the original value's fractional part was not exactly equal to `0.5` since subtracted `0.5` from the input earlier.

	return roundFn(x*0.5) * 2.0

Here the fractional part is equal to `0.5` so we need to round to nearest even (remember this isn't the same as away from zero like all the others; this is just how Postgres rounding works). The comment in the code describes it best:

> Dividing input+0.5 by 2, taking the floor and multiplying by 2 yields the closest even number.  This part assumes that division by 2 is exact, which should be OK because underflow is impossible here: x is an integer.

We could change this line to round away from zero with:

	return xOrig + math.Copysign(0.5, xOrig)

Which makes this function work except when the input is exactly equal to `0.5` or `-0.5`, because those cases are handled specially above.

Notably, Postgres does not provide a `round(x, n)` function as it is likely really hard to do correctly, since it has two difficult problems in one, as we've seen above. (CockroachDB *does* have that function, but it cheats a bit by [converting the float](https://github.com/cockroachdb/cockroach/blob/cdfc68af81c962831033098551de3846e409cec1/pkg/sql/parser/builtins.go#L1368) to an infinite-precision decimal, rounding there, and converting back.)

### github.com/montanaflynn/stats

An implementation supporting precision selection at [github.com/montanaflynn/stats](https://github.com/montanaflynn/stats/blob/41c34e4914ec3c05d485e564d9028d8861d5d9ad/round.go#L5) works for the test inputs if specifying 0 precision. (Note that it doesn't detect the overflow if precision is high, but otherwise is a good implementation.) With comments and the precision code removed:

```
func round(input float64) {
	if math.IsNaN(input) {
		return math.NaN()
	}
	sign := 1.0
	if input < 0 {
		sign = -1
		input *= -1
	}
	_, decimal := math.Modf(input)
	var rounded float64
	if decimal >= 0.5 {
		rounded = math.Ceil(input)
	} else {
		rounded = math.Floor(input)
	}
	return rounded * sign
}
```

The key difference between this algorithm and others is the use of `math.Modf`, which correctly splits out the fractional and integer part.

### math.Round in Go 1.10

Some months after the release of Go 1.8, someone [re-requested the addition of math.Round](https://github.com/golang/go/issues/20100). This discussion continued to post broken round implementations (bringing the number of broken implementations up to something above 8). But happily, the Go team has agreed to add `math.Round` in Go 1.10! Even more happily, someone has posted a [working implementation](https://go-review.googlesource.com/c/43652/).

```
func Round(x float64) float64 {
	const (
		mask     = 0x7FF
		shift    = 64 - 11 - 1
		bias     = 1023

		signMask = 1 << 63
		fracMask = (1 << shift) - 1
		halfMask = 1 << (shift - 1)
		one      = bias << shift
	)

	bits := math.Float64bits(x)
	e := uint(bits>>shift) & mask
	switch {
	case e < bias:
		// Round abs(x)<1 including denormals.
		bits &= signMask // +-0
		if e == bias-1 {
			bits |= one // +-1
		}
	case e < bias+shift:
		// Round any abs(x)>=1 containing a fractional component [0,1).
		e -= bias
		bits += halfMask >> e
		bits &^= fracMask >> e
	}
	return math.Float64frombits(bits)
}
```

For those unfamiliar with how floats are implemented (I'm on that list), this function looks magical. Let's dig in and see how this works. Looking at the first two lines of code (skipping the constants):

	bits := math.Float64bits(x)
	e := uint(bits>>shift) & mask
	
It looks like we get some bits, and are selecting some information out of them in the shift and mask. From [IEEE 754](https://en.wikipedia.org/wiki/IEEE_754#Interchange_formats):

> The encoding scheme for these binary interchange formats is the same as that of IEEE 754-1985: a sign bit, followed by w exponent bits that describe the exponent offset by a bias, and p−1 bits that describe the significand.

Looking at the consts above, the shift is `64 - 11 - 1`, which is 64 total bits less 11 for the exponent and 1 for the sign, or 52 bits for the mantissa (or significand). This means the shift is removing the 52 mantissa bits and the mask is removing the sign bit, leaving us with just the exponent.

	switch {
	case e < bias:

Exponents are offset by a bias, 1023 in this case, which means you have to subtract 1023 from the `e` computed above to get the actual exponent. Or, as written above, if `e < bias`, then we have a negative exponent, which means the absolute value of the float must be `0 < x < 1`. Indeed, the code reads:

	// Round abs(x)<1 including denormals.
	bits &= signMask // +-0
	if e == bias-1 {
		bits |= one // +-1
	}

Here bits is masked with the sign bit, so it will be `1<<63` if negative or 0 if positive. This is only used to preserve the correct sign: we can completely ignore the mantissa now. We can do that because what we actually care about is the exponent. Exponents in floats are in base 2, not 10. The representation is: `(sign) (mantissa) * 2 ^ exponent`. Since we are already in a `e < bias` block, we know that the smallest exponent we could have is -1. `2 ^ -1` is `0.5`. Furthermore, the mantissa has some value `1.X`, where X are the bits of the mantissa in base 2. Thus, with exponent -1, the float must be in the range [0.5, 1). If the exponent were smaller at -2, then the float would have some value less than 0.5. So, if `e == bias-1`, we are >= 0.5, and thus need to add one to the result. Phew. See [Double-precision floating-point](https://en.wikipedia.org/wiki/Double-precision_floating-point_format) for the details about this.

Now the second case:

	case e < bias+shift:

What you think is going to be the condition in this case statement is `case e > bias` to cover all of the positive exponents. But instead we only get a subset of them. The use of shift here is especially interesting because it doesn't seem to be of a compatible unit with bias. One is the number of bits to move, the other is a numeric offset. But, since floats are represented as `(1.mantissa) * 2 ^ X`, if `X` is larger than the number of bits in the mantissa, we are guaranteed to have a value with no fractional part. That is, the exponent has moved the decimal point to the right enough that the mantissa is completely to its left. Thus, this case statement ignores float values that are already rounded.


	// Round any abs(x)>=1 containing a fractional component [0,1).
	e -= bias
	bits += halfMask >> e
	bits &^= fracMask >> e

The first line here is easy: remove the bias out of e so we get the real exponent. The second line adds 0.5 to the value. This works because the highest bit of the mantissa contributes 0.5 to its final sum (see the representation linked in the wikipedia article above). In the case that this sum overflows the 52-bit bounds of the mantissa, the exponent will be increased by one. The exponent won't ever overflow to the sign bit because the exponent can't be higher than `bias+shift` from the case above. In either case, the fractional part is cleared. Thus, if the fractional part was >= 0.5, it will increase the value by 1, otherwise it will truncate it. Tricky, and not at all obvious until we looked deeper.

## Conclusion

This post has mostly described away-from-zero rounding, but there are [many others](https://en.wikipedia.org/wiki/Rounding#Rounding_to_integer). Some applications may need others, and it is an exercise to the reader to figure those out. With the description of how correct rounding is performed in Go, though, it should now be more clear how to correctly write and evaluate rounding implementations.

I think the Go team made the correct decision to reconsider the addition of the Round function in the standard library. Without that, we were stuck with lots of broken implementations. It is also no surprise that they chose to not add a function that accepted the number of digits to round, since that adds some additional complication that can quickly break things.

The other insight here is that there are some very subtle issues with floats, and even experts can get them wrong. The "just `<one liner>`" copy pastes from issues are easy to come up with, but tricky to get correct.

Finally, correctly rounding floating point numbers is ridiculously hard. It is no surprise that Java was broken for 6 major versions (15 years since the release of the Java 1.0 until Java 7). At least Go got there in less time than that.
