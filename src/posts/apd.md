---
title: "apd: An Arbitrary-Precision Decimal Package for Go"
date: 2017-03-15
tags:
  - posts
layout: layouts/post.njk
---

_(Also published on the [Cockroach Labs Blog](https://www.cockroachlabs.com/blog/apd-arbitrary-precision-decimal-package/).)_

With the release of CockroachDB [beta-20170223](https://www.cockroachlabs.com/docs/beta-20170223.html), we’d like to announce a new [arbitrary-precision decimal package for Go: apd](https://github.com/cockroachdb/apd). This package replaces the underlying implementation of the `DECIMAL` type in CockroachDB and is available for anyone to fork and use. Here we will describe why we made apd, some of its features, and how it improved CockroachDB.

## Background on Decimals

The two standard numeric types in computing are integers and floats, which handle the two main problems in number representation: the need for exact integral numbers within a fixed, relatively small range (ints) and the need for numbers, within an arbitrarily large range, that can be approximate (floats). But SQL presents a third need: exact numbers within an arbitrarily large range. Any application that requires a high degree of precision in its calculations or that must guarantee exactness (that is, it is guaranteed to not round) can use neither int nor float. The SQL spec defines a decimal type to handle this kind of work that is able to perform computations either exactly or with a user-defined level of precision.

The Go standard library includes a [math/big package](https://golang.org/pkg/math/big/) which extends the normal integer and float types to be able to operate on data with user-defined precision, which covers many use cases beyond the normal fixed-size integer and float types. If your problem domain requires non-integer computations, the `big.Float` type handles many use cases. However `big.Float` suffers from similar inexactness problems as the fixed-precision types, albeit at more of a user-defined precision. That is, the binary floating point types [cannot exactly represent decimal fractions](http://speleotrove.com/decimal/decifaq1.html#inexact). To solve this problem, a type based on the decimal representation of numbers is needed.

CockroachDB uses Go’s int64 and float64 types to support the corresponding `integer` and `float` SQL types. SQL also specifies support for `decimal` types. Go [does not come with a decimal package](https://github.com/golang/go/issues/12127), so we initially used an existing package, [gopkg.in/inf.v0](https://godoc.org/gopkg.in/inf.v0). This served us well as a starting point, but over time we began to notice problems with it. [Certain operations](https://github.com/cockroachdb/cockroach/blob/4ac3ba3a212bfacf5147d221f593bd327dddf424/pkg/sql/testdata/decimal) would produce incorrect results, panic, complete slowly, or fail to complete at all, fully using a CPU core. Many of these issues were fixed with checks inside CockroachDB to try to prevent runaway processes. Even with many of these problems triaged, there were still known inaccuracies and user-visible problems that were related to the design of the Go package, which were preventing us from meeting our own goals of:

- Panic-free operation
- Support for standard functions like `sqrt`, `log`, `pow`, etc
- Accurate and configurable precision
- Good performance

We decided that fixing these issues would be about the same amount of work as starting from scratch. We also evaluated other Go decimal packages, but we decided that they would likely never meet our requirements due to the similar re-engineering required. We respect the work of those authors, but we had different goals. 

So in December 2016 we started development on apd. By February 2017, we ended up with a new decimal package that is really useful to us and that we hope is sufficient for reuse by the Go community.

## Features of apd

apd implements much of the decimal specification from the [General Decimal Arithmetic](http://speleotrove.com/decimal/) description. This is the same specification implemented by [python’s decimal module](https://docs.python.org/2/library/decimal.html) and GCC’s decimal extension.

This package has many features:

- **Panic-free operation**. The `math/big` types don’t return errors, and instead panic under some conditions that are documented. This requires users to validate the inputs before using them. Meanwhile, we’d like our decimal operations to have more failure modes and more input requirements than the `math/big` types, so using that API would be difficult. apd instead returns errors when needed.
- **Support for standard functions**. `sqrt`, `ln`, `pow`, etc.
- **Accurate and configurable precision**. Operations will use enough internal precision to produce a correct result at the requested precision. Precision is set by a “context” structure that accompanies the function arguments, as discussed in the next section.
- **Good performance**. Operations will either be fast enough or will produce an error if they will be slow. This prevents edge-case operations from consuming lots of CPU or memory. Numerous academic papers were consulted and are referenced (for example: [`sqrt`](http://dl.acm.org/citation.cfm?id=214413), [`ln`](http://www.jstor.org/stable/2324849), [`exp`](http://dl.acm.org/citation.cfm?id=6498)). These papers prove and describe algorithms that perform much better than their naive counterparts.
- **Condition flags and traps**. All operations will report whether their result is exact, is rounded, is over- or under-flowed, is [subnormal](https://en.wikipedia.org/wiki/Denormal_number), or is some other condition. apd supports traps which will trigger an error on any of these conditions. This makes it possible to guarantee exactness in computations, if needed.

apd has two main types. The first is [`Decimal`](https://godoc.org/github.com/cockroachdb/apd#Decimal) which holds the values of decimals. It is simple and uses a `big.Int` with an exponent to describe values. Most operations on `Decimal`s can’t produce errors as they work directly on the underlying `big.Int`. Notably, however, there are no arithmetic operations on `Decimal`s.

The second main type is [`Context`](https://godoc.org/github.com/cockroachdb/apd#Context), which is where all arithmetic operations are defined. A `Context` describes the precision, range, and some other restrictions during operations. These operations can all produce failures, and so return errors.

`Context` operations, in addition to errors, return a [`Condition`](https://godoc.org/github.com/cockroachdb/apd#Condition), which is a bitfield of flags that occurred during an operation. These include overflow, underflow, inexact, rounded, and others. The `Traps` field of a `Context` can be set which will produce an error if the corresponding flag occurs. An example of this is given below.

These features allow apd’s API to enable new kinds of operations that were previously difficult to perform in Go.

### Precision

A `Context`’s precision can be increased as desired. Flags and errors will change based on the operation being performed and whether or not it needs more precision to work. Inexact flags can be raised if there’s not enough precision to store the result.

For example:

```
twoHundred := apd.New(2, 2)
fiveTwelve := apd.New(512, 0)
d := new(apd.Decimal)
c := apd.BaseContext
for i := uint32(0); i <= 7; i++ {
    c.Precision = i
    res, err := c.Quo(d, twoHundred, fiveTwelve)
    fmt.Printf("%d: %s", i, d)
    if err != nil {
        fmt.Printf(", error: %s", err)
    }
    if res != 0 {
        fmt.Printf(" (%s)", res)
    }
    fmt.Println()
}
```

Output:

```
0: 0, error: Context may not have 0 Precision for this operation
1: 0.4 (inexact, rounded)
2: 0.39 (inexact, rounded)
3: 0.391 (inexact, rounded)
4: 0.3906 (inexact, rounded)
5: 0.39063 (inexact, rounded)
6: 0.390625
7: 0.390625
```

### Overflow and Underflow

apd can detect or error on overflow and underflow conditions. We can define a context that has an exponent limit then perform operations with it until an overflow condition occurs.


For example:

```
// Create a context that will overflow at 1e3.
c := apd.Context{
    MaxExponent: 2,
    Traps:       apd.Overflow,
}
one := apd.New(1, 0)
d := apd.New(997, 0)
for {
    res, err := c.Add(d, d, one)
    fmt.Printf("d: %4s, overflow: %5v, err: %v\n", d, res.Overflow(), err)
    if err != nil {
        return
    }
}
```

Output:


```
d:  998, overflow: false, err: <nil>
d:  999, overflow: false, err: <nil>
d: 1000, overflow:  true, err: overflow
```

### Exactness

Some operations like division can sometimes produce exact (`1/2`) or inexact (`1/3`) outputs. The `Inexact` flag can be checked for inexact operations. The `1/3` example here will always be inexact. But there are other operations that will only be exact if the context has enough precision to fit the result.

For example:

```
d := apd.New(27, 0)
three := apd.New(3, 0)
c := apd.BaseContext.WithPrecision(5)
for {
    res, err := c.Quo(d, d, three)
    fmt.Printf("d: %7s, inexact: %5v, err: %v\n", d, res.Inexact(), err)
    if err != nil {
        return
    }
    if res.Inexact() {
        return
    }
}
```
Output:


```
d:       9, inexact: false, err: <nil>
d:       3, inexact: false, err: <nil>
d:       1, inexact: false, err: <nil>
d: 0.33333, inexact:  true, err: <nil>
```

### ErrDecimal

The ErrDecimal type wraps a context and and error. It will silently not perform operations after an error has occurred. This is useful to do many operations and then check for an error once at the end.

For example:

```
c := apd.BaseContext.WithPrecision(5)
ed := apd.MakeErrDecimal(c)
d := apd.New(10, 0)
fmt.Printf("%s, err: %v\n", d, ed.Err())
ed.Add(d, d, apd.New(2, 1)) // add 20
fmt.Printf("%s, err: %v\n", d, ed.Err())
ed.Quo(d, d, apd.New(0, 0)) // divide by zero
fmt.Printf("%s, err: %v\n", d, ed.Err())
ed.Sub(d, d, apd.New(1, 0)) // attempt to subtract 1
// The subtraction doesn't occur and doesn't change the error.
fmt.Printf("%s, err: %v\n", d, ed.Err())
```

Output:


```
10, err: <nil>
30, err: <nil>
30, err: division by zero
30, err: division by zero
```

### TODO

apd does not yet support:

- [NaN](https://en.wikipedia.org/wiki/NaN)
- Infinity

These are planned for some time in the future.

## apd and Decimals in CockroachDB

apd has allowed CockroachDB to have much greater parity with Postgres results, and at higher performance than before. Our tests have shown that CockroachDB now matches Postgres in nearly all operations. We hope to add more functionality to our SQL decimal implementation, like allowing users to define precision and rounding modes during SQL operations, although as stated above, the timing for that development isn’t yet clear.

## Conclusion

The [apd](https://github.com/cockroachdb/apd) package is a well-tested and useful addition to CockroachDB. It is under the Apache license, so will hopefully be useful to the wider Go community. Although it has not been in use for a long time, it has  shown to be better than an older package, and we had enough confidence in the tests to replace our implementation with it. As a disclaimer, we are not trained in numerical analysis. The papers we consulted were largely from the 1980s, so we hope there is more recent work that can be used to further improve performance. Contributions and API suggestions or complaints are welcome and encouraged by filing [GitHub issues](https://github.com/cockroachdb/apd/issues/new).
